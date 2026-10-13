import { describe, expect, it } from 'vitest';
import { ApiError, NETWORK_MESSAGE, SERVER_MESSAGE, errorMessage, isApiError, isFeatureOff, isNetworkError, loadProblem, toApiError } from './errors';

const response = (status: number) => new Response(null, { status });

describe('toApiError', () => {
  it('reads the API error shape', () => {
    const e = toApiError(response(429), {
      error: { code: 'rate_limited', message: 'Try again in 2 minutes.', retryAfter: 120 },
    });
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code, e.message, e.retryAfter]).toEqual([429, 'rate_limited', 'Try again in 2 minutes.', 120]);
    expect(e.fields).toEqual({});
  });

  it('keeps field messages for forms', () => {
    const e = toApiError(response(422), {
      error: { code: 'invalid_input', message: 'Some fields are not valid.', fields: { title: 'Too short.' } },
    });
    expect(e.fields).toEqual({ title: 'Too short.' });
  });

  it('falls back to a plain message when the body is not the API shape', () => {
    expect(toApiError(response(502), 'Bad gateway').code).toBe('internal');
    expect(toApiError(response(502), 'Bad gateway').message).toBe('Something went wrong on our side.');
    expect(toApiError(response(404), undefined).code).toBe('error');
  });

  it('knows a signed-out answer', () => {
    expect(toApiError(response(401), { error: { code: 'unauthenticated', message: 'Sign in.' } }).isUnauthenticated).toBe(
      true,
    );
  });
});

describe('errorMessage', () => {
  it('shows API messages as they are and hides anything else', () => {
    expect(errorMessage(new ApiError({ status: 409, code: 'slug_taken', message: 'Try another title.' }))).toBe(
      'Try another title.',
    );
    expect(errorMessage(new TypeError('x is undefined'))).toBe('Something went wrong. Try again.');
    expect(isApiError(new Error('plain'))).toBe(false);
  });

  it('blames the connection only when there was no answer', () => {
    const offline = new ApiError({ status: 0, code: 'network', message: 'Could not reach the server.' });
    expect(errorMessage(offline)).toBe(NETWORK_MESSAGE);
    expect(isNetworkError(offline)).toBe(true);
    expect(errorMessage(toApiError(response(502), 'Bad gateway'))).toBe(SERVER_MESSAGE);
    expect(isNetworkError(toApiError(response(502), 'Bad gateway'))).toBe(false);
  });

  it('uses the fallback for anything that is not an API error', () => {
    expect(errorMessage(new Error('boom'), 'Couldn’t save. Try again.')).toBe('Couldn’t save. Try again.');
    expect(errorMessage(undefined)).toBe('Something went wrong. Try again.');
  });
});

describe('loadProblem', () => {
  it('says what went wrong under a state that did not load (UX-10)', () => {
    expect(loadProblem(new ApiError({ status: 0, code: 'network', message: 'x' }))).toBe(NETWORK_MESSAGE);
    expect(loadProblem(toApiError(response(500), undefined))).toBe(SERVER_MESSAGE);
    expect(loadProblem(toApiError(response(503), { error: { code: 'internal', message: 'Something went wrong on our side.' } }))).toBe(
      SERVER_MESSAGE,
    );
    expect(loadProblem(new TypeError('cannot read x'))).toBe(SERVER_MESSAGE);
  });

  it('keeps a refusal the person can act on', () => {
    expect(loadProblem(toApiError(response(403), { error: { code: 'forbidden', message: 'Only admins can see this.' } }))).toBe(
      'Only admins can see this.',
    );
    expect(loadProblem(toApiError(response(404), undefined))).toBe(SERVER_MESSAGE);
  });
});

describe('isFeatureOff', () => {
  it('recognises a switched-off feature', () => {
    expect(isFeatureOff(new ApiError({ status: 404, code: 'feature_off', message: 'This part of the hub is switched off right now.' }))).toBe(true);
    expect(isFeatureOff(new ApiError({ status: 404, code: 'not_found', message: 'Not here.' }))).toBe(false);
    expect(isFeatureOff(new Error('feature_off'))).toBe(false);
  });
});
