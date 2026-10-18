import { describe, expect, it } from 'vitest';
import { ApiError, type ApiErrorCode } from '../../api/errors';
import { canRetry, combinedState } from './saveState';

describe('the note’s save state', () => {
  it('shows what needs the student most, text or handwriting', () => {
    expect(combinedState('saved', 'saved')).toBe('saved');
    expect(combinedState('saved', 'saving')).toBe('saving');
    expect(combinedState('unsaved', 'saving')).toBe('saving');
    expect(combinedState('saved', 'offline')).toBe('offline');
    expect(combinedState('offline', 'error')).toBe('error');
    expect(combinedState('error', 'conflict')).toBe('conflict');
  });
});

describe('trying a save again', () => {
  it('helps when the save didn’t arrive or the server failed, not when it refused what was sent', () => {
    const error = (status: number, code: ApiErrorCode = 'internal') => new ApiError({ status, code, message: 'm' });
    expect(canRetry(error(0, 'network'))).toBe(true);
    expect(canRetry(error(500))).toBe(true);
    expect(canRetry(error(429, 'rate_limited'))).toBe(true);
    expect(canRetry(error(422, 'invalid_input'))).toBe(false);
    expect(canRetry(error(413, 'too_large'))).toBe(false);
    expect(canRetry(error(404, 'not_found'))).toBe(false);
    expect(canRetry(new Error('anything else'))).toBe(true);
  });
});
