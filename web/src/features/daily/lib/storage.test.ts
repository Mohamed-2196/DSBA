import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGuestMoves, guestMoves, hasSeenRules, loadNotes, markRulesSeen, prune, saveGuestMoves, saveNotes } from './storage';

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

describe('a guest’s moves', () => {
  it('are kept per day, game and difficulty', () => {
    saveGuestMoves('2026-10-17', 'sudoku', 'easy', [{ kind: 'hint' }], '2026-10-17');
    expect(guestMoves('2026-10-17', 'sudoku', 'easy')).toEqual([{ kind: 'hint' }]);
    expect(guestMoves('2026-10-17', 'sudoku', 'hard')).toEqual([]);
    clearGuestMoves('2026-10-17', 'sudoku', 'easy');
    expect(guestMoves('2026-10-17', 'sudoku', 'easy')).toEqual([]);
  });

  it('are cleared after a fortnight', () => {
    saveGuestMoves('2026-09-01', 'word', '', [{ kind: 'give-up' }], '2026-09-01');
    saveGuestMoves('2026-10-17', 'word', '', [{ kind: 'give-up' }], '2026-10-17');
    expect(guestMoves('2026-09-01', 'word')).toEqual([]);
    expect(guestMoves('2026-10-17', 'word')).toHaveLength(1);
  });

  it('read as none when storage is missing', () => {
    delete g.window;
    expect(guestMoves('2026-10-17', 'word')).toEqual([]);
    expect(() => saveGuestMoves('2026-10-17', 'word', '', [], '2026-10-17')).not.toThrow();
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
    g.window?.localStorage.setItem('hub.mine.daily.notes.2026-10-17:hard', JSON.stringify({ 3: [0, 10, 4], 99: [1], x: 'no' }));
    expect(loadNotes('2026-10-17', 'hard')).toEqual({ 3: [4] });
  });

  it('prune leaves other keys alone', () => {
    g.window?.localStorage.setItem('hub.theme', 'dark');
    prune('hub.mine.daily.notes.', '2026-10-17');
    expect(g.window?.localStorage.getItem('hub.theme')).toBe('dark');
  });
});
