import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markGoogleTrip, readAuthError, takeGoogleTrip } from './googleTrip';

describe('readAuthError', () => {
  it('takes the code and leaves the rest of the address', () => {
    expect(readAuthError('?tab=new&authError=google_cancelled')).toEqual({
      code: 'google_cancelled',
      search: '?tab=new',
    });
    expect(readAuthError('?authError=google_failed')).toEqual({ code: 'google_failed', search: '' });
  });
  it('is null without one', () => {
    expect(readAuthError('?tab=new')).toBeNull();
    expect(readAuthError('')).toBeNull();
  });
});

describe('the trip to Google', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('is read once', () => {
    markGoogleTrip('link');
    expect(takeGoogleTrip()).toBe('link');
    expect(takeGoogleTrip()).toBeNull();
  });
  it('ignores anything else stored there', () => {
    window.sessionStorage.setItem('hub.google', 'other');
    expect(takeGoogleTrip()).toBeNull();
  });
});
