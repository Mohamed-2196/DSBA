import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Move } from '../types';
import {
  clearGuestPlay,
  guestDayKey,
  guestPlay,
  hasSeenRules,
  loadNotes,
  markRulesSeen,
  parseGuestPlays,
  prune,
  saveGuestPlay,
  saveNotes,
  type GuestPlay,
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

const play = (revision: number, ...moves: Move[]): GuestPlay => ({
  revision,
  moves,
  restarted: false,
  status: moves.length ? 'playing' : 'new',
  picture: null,
});
const none = { revision: 0, moves: [], restarted: false, status: 'new', picture: null };

describe('a guest’s plays', () => {
  it('are kept per day, game and difficulty, with the version of the puzzle each was played on', () => {
    saveGuestPlay('2026-10-17', 'sudoku', 'easy', play(1, { kind: 'hint' }), '2026-10-17');
    saveGuestPlay('2026-10-17', 'word', '', { ...play(0, { kind: 'give-up' }), status: 'lost' }, '2026-10-17');
    expect(guestPlay('2026-10-17', 'sudoku', 'easy')).toEqual(play(1, { kind: 'hint' }));
    expect(guestPlay('2026-10-17', 'sudoku', 'hard')).toEqual(none);
    expect(guestPlay('2026-10-17', 'word').status).toBe('lost');
    clearGuestPlay('2026-10-17', 'sudoku', 'easy');
    expect(guestPlay('2026-10-17', 'sudoku', 'easy')).toEqual(none);
    expect(guestPlay('2026-10-17', 'word').status).toBe('lost');
  });

  it('are personal: one key a day under hub.mine., which signing out clears', () => {
    saveGuestPlay('2026-10-17', 'word', '', play(0, { kind: 'give-up' }), '2026-10-17');
    expect(guestDayKey('2026-10-17')).toBe('hub.mine.daily.guest.2026-10-17');
    expect(g.window?.localStorage.getItem(guestDayKey('2026-10-17'))).toContain('"word:default"');
  });

  it('remember a play a fix started again', () => {
    saveGuestPlay('2026-10-17', 'word', '', { ...play(2), restarted: true }, '2026-10-17');
    expect(guestPlay('2026-10-17', 'word').restarted).toBe(true);
  });

  it('are cleared after a fortnight', () => {
    saveGuestPlay('2026-09-01', 'word', '', play(0, { kind: 'give-up' }), '2026-09-01');
    saveGuestPlay('2026-10-17', 'word', '', play(0, { kind: 'give-up' }), '2026-10-17');
    expect(guestPlay('2026-09-01', 'word')).toEqual(none);
    expect(guestPlay('2026-10-17', 'word').moves).toHaveLength(1);
  });

  it('drop what is malformed', () => {
    const kept = {
      'word:default': { revision: -1, moves: [] },
      'quiz:default': { revision: 1 },
      'groups:default': [],
      'search:default': { revision: 0, moves: [{ kind: 'hint' }], status: 'nonsense', picture: [['bright']] },
      'sudoku:easy': { revision: 0, moves: [{ kind: 'give-up' }], status: 'lost', picture: [['hit', 'miss']] },
    };
    expect(parseGuestPlays(kept)).toEqual({
      'search:default': play(0, { kind: 'hint' }),
      'sudoku:easy': { ...play(0, { kind: 'give-up' }), status: 'lost', picture: [['hit', 'miss']] },
    });
    for (const value of ['[{"kind":"hint"}]', 'nonsense', '42']) {
      g.window?.localStorage.setItem(guestDayKey('2026-10-17'), value);
      expect(guestPlay('2026-10-17', 'word')).toEqual(none);
    }
  });

  it('read as none when storage is missing', () => {
    delete g.window;
    expect(guestPlay('2026-10-17', 'word')).toEqual(none);
    expect(() => saveGuestPlay('2026-10-17', 'word', '', play(0), '2026-10-17')).not.toThrow();
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
