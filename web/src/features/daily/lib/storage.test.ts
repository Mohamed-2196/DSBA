import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Move } from '../types';
import {
  clearGuestPlay,
  guestPlay,
  hasSeenRules,
  loadNotes,
  markRulesSeen,
  prune,
  saveGuestPlay,
  saveNotes,
} from './storage';

/** A Map-backed localStorage on a stand-in window: the tests run in Node. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const g = globalThis as unknown as { window?: { localStorage: Storage } };

beforeEach(() => {
  g.window = { localStorage: fakeStorage() };
});
afterEach(() => {
  delete g.window;
});

const play = (revision: number, ...moves: Move[]) => ({ revision, moves, restarted: false });
const none = { revision: 0, moves: [], restarted: false };

describe('a guest’s play', () => {
  it('is kept per day, game and difficulty, with the version of the puzzle it was played on', () => {
    saveGuestPlay('2026-10-17', 'sudoku', 'easy', play(1, { kind: 'hint' }), '2026-10-17');
    expect(guestPlay('2026-10-17', 'sudoku', 'easy')).toEqual(play(1, { kind: 'hint' }));
    expect(guestPlay('2026-10-17', 'sudoku', 'hard')).toEqual(none);
    clearGuestPlay('2026-10-17', 'sudoku', 'easy');
    expect(guestPlay('2026-10-17', 'sudoku', 'easy')).toEqual(none);
  });

  it('remembers a play a fix started again', () => {
    saveGuestPlay('2026-10-17', 'word', '', { revision: 2, moves: [], restarted: true }, '2026-10-17');
    expect(guestPlay('2026-10-17', 'word').restarted).toBe(true);
  });

  it('is cleared after a fortnight', () => {
    saveGuestPlay('2026-09-01', 'word', '', play(0, { kind: 'give-up' }), '2026-09-01');
    saveGuestPlay('2026-10-17', 'word', '', play(0, { kind: 'give-up' }), '2026-10-17');
    expect(guestPlay('2026-09-01', 'word')).toEqual(none);
    expect(guestPlay('2026-10-17', 'word').moves).toHaveLength(1);
  });

  it('reads as none when what is kept is malformed', () => {
    for (const value of ['[{"kind":"hint"}]', '{"revision":-1,"moves":[]}', '{"revision":1}', 'nonsense']) {
      g.window?.localStorage.setItem('hub.daily.guest.2026-10-17:word:default', value);
      expect(guestPlay('2026-10-17', 'word')).toEqual(none);
    }
  });

  it('reads as none when storage is missing', () => {
    delete g.window;
    expect(guestPlay('2026-10-17', 'word')).toEqual(none);
    expect(() => saveGuestPlay('2026-10-17', 'word', '', none, '2026-10-17')).not.toThrow();
  });
});

describe('rules seen', () => {
  it('remembers each game once', () => {
    expect(hasSeenRules('word')).toBe(false);
    markRulesSeen('word');
    markRulesSeen('word');
    expect(hasSeenRules('word')).toBe(true);
    expect(hasSeenRules('quiz')).toBe(false);
  });
});

describe('Sudoku notes', () => {
  it('round-trip and drop anything malformed', () => {
    saveNotes('2026-10-17', 'easy', { 3: [5, 1], 7: [2] }, '2026-10-17');
    expect(loadNotes('2026-10-17', 'easy')).toEqual({ 3: [1, 5], 7: [2] });
    g.window?.localStorage.setItem(
      'hub.mine.daily.notes.2026-10-17:hard',
      JSON.stringify({ 3: [0, 10, 4], 99: [1], x: 'no' }),
    );
    expect(loadNotes('2026-10-17', 'hard')).toEqual({ 3: [4] });
  });

  it('prune leaves other keys alone', () => {
    g.window?.localStorage.setItem('hub.theme', 'dark');
    prune('hub.mine.daily.notes.', '2026-10-17');
    expect(g.window?.localStorage.getItem('hub.theme')).toBe('dark');
  });
});
