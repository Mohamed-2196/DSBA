import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NETWORK_MESSAGE,
  SERVER_MESSAGE,
  typeset,
  errorMessage,
  fieldKey,
  isApiError,
  isFeatureOff,
  isNetworkError,
  loadProblem,
  placeFieldErrors,
  toApiError,
  unplacedMessage,
} from './errors';

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

  it('names every field as forms do, whatever the location the key starts with', () => {
    const e = toApiError(response(422), {
      error: {
        code: 'invalid_input',
        message: 'Some fields are not valid.',
        fields: {
          title: 'Too short.',
          'body.summary': 'Too long.',
          'query.page': 'Use a whole number.',
          'data.groups.level': 'Pick a level.',
          'links.0.url': 'Use an https:// link.',
          body: 'Write something.',
        },
      },
    });
    expect(e.fields).toEqual({
      title: 'Too short.',
      summary: 'Too long.',
      page: 'Use a whole number.',
      'data.groups.level': 'Pick a level.',
      'links.0.url': 'Use an https:// link.',
      body: 'Write something.',
    });
  });

  it('falls back to a plain message when the body is not the API shape', () => {
    expect(toApiError(response(502), 'Bad gateway').code).toBe('internal');
    expect(toApiError(response(502), 'Bad gateway').message).toBe('Something went wrong on our side.');
    expect(toApiError(response(404), undefined).code).toBe('error');
  });

  it('knows a signed-out answer', () => {
    expect(
      toApiError(response(401), { error: { code: 'unauthenticated', message: 'Sign in.' } }).isUnauthenticated,
    ).toBe(true);
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

  it('shows why a role in use cannot be deleted', () => {
    const message = 'Switched on for this role: Calendar. Change its switch first, then delete the role.';
    const refused = toApiError(response(409), { error: { code: 'role_in_use', message } });
    expect([refused.code, errorMessage(refused)]).toEqual(['role_in_use', message]);
  });

  it('uses the fallback for anything that is not an API error', () => {
    expect(errorMessage(new Error('boom'), 'Couldn’t save. Try again.')).toBe('Couldn’t save. Try again.');
    expect(errorMessage(undefined)).toBe('Something went wrong. Try again.');
  });
});

describe('loadProblem', () => {
  it('says what went wrong under a state that did not load', () => {
    expect(loadProblem(new ApiError({ status: 0, code: 'network', message: 'x' }))).toBe(NETWORK_MESSAGE);
    expect(loadProblem(toApiError(response(500), undefined))).toBe(SERVER_MESSAGE);
    expect(
      loadProblem(
        toApiError(response(503), { error: { code: 'internal', message: 'Something went wrong on our side.' } }),
      ),
    ).toBe(SERVER_MESSAGE);
    expect(loadProblem(new TypeError('cannot read x'))).toBe(SERVER_MESSAGE);
  });

  it('keeps a refusal the person can act on', () => {
    expect(
      loadProblem(toApiError(response(403), { error: { code: 'forbidden', message: 'Only admins can see this.' } })),
    ).toBe('Only admins can see this.');
    expect(loadProblem(toApiError(response(404), undefined))).toBe(SERVER_MESSAGE);
  });
});

describe('isFeatureOff', () => {
  it('recognises a switched-off feature', () => {
    expect(
      isFeatureOff(
        new ApiError({ status: 404, code: 'feature_off', message: 'This part of the hub is switched off right now.' }),
      ),
    ).toBe(true);
    expect(isFeatureOff(new ApiError({ status: 404, code: 'not_found', message: 'Not here.' }))).toBe(false);
    expect(isFeatureOff(new Error('feature_off'))).toBe(false);
  });
});

describe('fieldKey', () => {
  it('keeps one-part, nested and list keys as they are', () => {
    expect(fieldKey('title')).toBe('title');
    expect(fieldKey('data.tagline')).toBe('data.tagline');
    expect(fieldKey('data.groups.level')).toBe('data.groups.level');
    expect(fieldKey('links.0.url')).toBe('links.0.url');
  });

  it('drops the location the value came from, but not a field called body', () => {
    expect(fieldKey('body.title')).toBe('title');
    expect(fieldKey('body.links.0.url')).toBe('links.0.url');
    expect(fieldKey('query.q')).toBe('q');
    expect(fieldKey('body')).toBe('body');
    expect(fieldKey('request')).toBe('request');
  });
});

describe('placeFieldErrors', () => {
  const names = ['title', 'body', 'tags', 'links', 'links.0.url', 'data.level'] as const;

  it('puts a one-part key on its field', () => {
    expect(placeFieldErrors({ title: 'Too short.' }, names)).toEqual({ fields: { title: 'Too short.' }, other: [] });
  });

  it('puts a location-prefixed key on its field', () => {
    expect(placeFieldErrors({ 'body.title': 'Too short.', body: 'Write something.' }, names).fields).toEqual({
      title: 'Too short.',
      body: 'Write something.',
    });
  });

  it('puts a nested key on its field, or on the closest field it lies under', () => {
    expect(placeFieldErrors({ 'data.level': 'Pick a level.' }, names).fields).toEqual({
      'data.level': 'Pick a level.',
    });
    expect(placeFieldErrors({ 'data.groups.level': 'Pick a level.' }, names)).toEqual({
      fields: {},
      other: ['Pick a level.'],
    });
  });

  it('puts a list item’s key on the item’s field, or on the list', () => {
    expect(
      placeFieldErrors(
        { 'links.0.url': 'Use an https:// link.', 'links.1.url': 'Give the link.', 'tags.2': 'Too long.' },
        names,
      ).fields,
    ).toEqual({ 'links.0.url': 'Use an https:// link.', links: 'Give the link.', tags: 'Too long.' });
  });

  it('keeps what no field shows, once each, and the first message for a field', () => {
    expect(
      placeFieldErrors(
        {
          request: 'The request isn’t valid.',
          version: 'Field required',
          'tags.0': 'Too long.',
          'tags.1': 'Too short.',
          titles: 'x',
        },
        names,
      ),
    ).toEqual({ fields: { tags: 'Too long.' }, other: ['The request isn’t valid.', 'Field required', 'x'] });
  });
});

describe('unplacedMessage', () => {
  const refused = (fields: Record<string, string>) =>
    new ApiError({ status: 422, code: 'invalid_input', message: 'Title is too short.', fields });

  it('is the API’s message when no field shows any of it', () => {
    const e = refused({ request: 'The request isn’t valid.' });
    expect(unplacedMessage(e, placeFieldErrors(e.fields, ['title']))).toBe('Title is too short.');
  });

  it('is what no field shows, or null when every message is on a field', () => {
    const some = refused({ title: 'Too short.', version: 'Field required' });
    expect(unplacedMessage(some, placeFieldErrors(some.fields, ['title']))).toBe('Field required');
    const all = refused({ 'body.title': 'Too short.' });
    expect(unplacedMessage(all, placeFieldErrors(all.fields, ['title']))).toBeNull();
    expect(unplacedMessage(null, placeFieldErrors({}, ['title']))).toBeNull();
  });
});

describe('the API’s words (ST-77)', () => {
  it('take a curly apostrophe inside a word, as the app’s own copy does', () => {
    expect(typeset("That code isn't right. 4 tries left.")).toBe('That code isn’t right. 4 tries left.');
    expect(typeset("'quoted' and rock 'n' roll")).toBe("'quoted' and rock 'n' roll");
  });

  it('in messages and in each field', () => {
    const e = new ApiError({
      status: 409,
      code: 'number_taken',
      message: "Issue 9 isn't free.",
      fields: { number: "isn't" },
    });
    expect(e.message).toBe('Issue 9 isn’t free.');
    expect(e.fields.number).toBe('isn’t');
  });
});
