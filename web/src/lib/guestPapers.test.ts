import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanPicks, GUEST_PAPERS_KEY, guestPicksOf, readGuestPicks } from './guestPapers';

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('a guest’s papers', () => {
  it('cleanPicks trusts nothing stored', () => {
    expect(cleanPicks(null)).toEqual([]);
    expect(cleanPicks(['a', 'a', 3, 'Bad Id', 'b'])).toEqual(['a', 'b']);
    expect(cleanPicks(Array.from({ length: 30 }, (_, i) => `m${i}`))).toHaveLength(20);
  });

  it('reads the picks out of what the browser keeps', () => {
    expect(guestPicksOf(null)).toEqual([]);
    expect(guestPicksOf('econometrics')).toEqual([]);
    expect(guestPicksOf({ papers: ['econometrics', 'Bad'], zone: 'A' })).toEqual(['econometrics']);
  });

  it('readGuestPicks reads localStorage, and nothing when it is not JSON', () => {
    expect(readGuestPicks()).toEqual([]);
    store.set(GUEST_PAPERS_KEY, JSON.stringify({ papers: ['information-systems'], zone: null }));
    expect(readGuestPicks()).toEqual(['information-systems']);
    store.set(GUEST_PAPERS_KEY, '{not json');
    expect(readGuestPicks()).toEqual([]);
  });
});
