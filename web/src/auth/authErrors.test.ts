import { describe, expect, it } from 'vitest';
import { ApiError, type ApiErrorCode } from '../api/errors';
import { authErrorMessage, checkEmail, checkNewPassword, fieldOf, googleErrorMessage, waitText } from './authErrors';

function apiError(
  code: ApiErrorCode,
  message = '',
  fields: Record<string, string> = {},
  retryAfter?: number,
): ApiError {
  return new ApiError({ status: 422, code, message, fields, retryAfter });
}

describe('authErrorMessage', () => {
  it('prefers the server’s own sentence', () => {
    expect(authErrorMessage(apiError('weak_password', 'Use at least 8 characters.'))).toBe(
      'Use at least 8 characters.',
    );
  });
  it('falls back on a sentence of its own', () => {
    expect(authErrorMessage(apiError('rate_limited', '', {}, 90))).toBe('Too many tries. Try again in 2 minutes.');
    expect(authErrorMessage(new Error('x'))).toBe('Something went wrong. Try again.');
  });
});

describe('fieldOf', () => {
  it('names the field a problem belongs under', () => {
    expect(fieldOf(apiError('weak_password', 'x', { newPassword: 'x' }))).toBe('newPassword');
    expect(fieldOf(apiError('email_taken', 'x'))).toBe('email');
    expect(fieldOf(apiError('invalid_credentials', 'x'))).toBeNull();
  });
});

describe('googleErrorMessage', () => {
  it('reads the codes Google’s return brings, and nothing else', () => {
    expect(googleErrorMessage('google_cancelled')).toMatch(/didn’t finish/);
    expect(googleErrorMessage('something_new')).toMatch(/didn’t work/);
    expect(googleErrorMessage(null)).toBeNull();
  });
});

describe('checks before sending', () => {
  it('checks an email address lightly', () => {
    expect(checkEmail('')).toMatch(/Enter/);
    expect(checkEmail('nobody')).toMatch(/doesn’t look right/);
    expect(checkEmail(' sara@example.com ')).toBeNull();
  });
  it('asks for 8 characters or more', () => {
    expect(checkNewPassword('seven82')).toMatch(/at least 8/);
    expect(checkNewPassword('newday82')).toBeNull();
    expect(checkNewPassword('newday823')).toBeNull();
    expect(checkNewPassword('long enough now')).toBeNull();
  });
  it('writes waits for people', () => {
    expect(waitText(1)).toBe('1 second');
    expect(waitText(3600)).toBe('1 hour');
  });
});
