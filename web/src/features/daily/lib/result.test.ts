import { describe, expect, it } from 'vitest';
import { HELD, resultOf } from './result';
import { statusOf } from './status';
import type { GameDay, Play } from '../types';

const base = {
  day: '2026-10-18',
  number: 18,
  variant: '',
  scored: true,
  points: 90,
  mistakes: 0,
  hints: 0,
  seconds: 75,
  result: null,
  share: 'x',
  revision: 0,
  restarted: false,
};

describe('resultOf', () => {
  it('praises a word found, by the guess that found it', () => {
    const play = {
      ...base,
      game: 'word',
      status: 'won',
      view: {
        kind: 'word',
        length: 5,
        maxGuesses: 6,
        rows: [
          { word: 'CRANE', marks: [] },
          { word: 'TABLE', marks: [] },
        ],
        answer: 'TABLE',
      },
    } as unknown as Play;
    expect(resultOf(play)).toEqual({
      headline: 'Brilliant',
      summary: 'Solved in 2 guesses',
      answer: null,
      held: false,
    });
  });

  it('gives the answer of a lost word, but holds it for a guest playing today', () => {
    const play = {
      ...base,
      game: 'word',
      status: 'lost',
      view: { kind: 'word', length: 5, maxGuesses: 6, rows: [], answer: 'TABLE' },
    } as unknown as Play;
    expect(resultOf(play).answer).toBe('TABLE');
    const held = resultOf({ ...play, view: { ...play.view, answer: null } } as unknown as Play, true);
    expect([held.answer, held.held, held.summary]).toEqual([null, true, 'Out of guesses']);
    expect(HELD).toMatch(/^Sign in to see the answer/);
  });

  it('counts the groups the player found, not the ones shown at the end', () => {
    const groups = [
      { label: 'A', level: 1, words: ['A1', 'A2', 'A3', 'A4'] },
      { label: 'B', level: 2, words: ['B1', 'B2', 'B3', 'B4'] },
    ];
    const play = {
      ...base,
      game: 'groups',
      status: 'lost',
      mistakes: 4,
      view: {
        kind: 'groups',
        words: [],
        found: groups,
        mistakesLeft: 0,
        guesses: [
          ['A1', 'A2', 'A3', 'A4'],
          ['A1', 'B2', 'B3', 'B4'],
        ],
        oneAway: false,
      },
    } as unknown as Play;
    expect(resultOf(play).summary).toBe('1 of 4 groups found');
  });

  it('counts the words the player found, not the ones revealed', () => {
    const cell = { row: 0, col: 0 };
    const found = [
      { word: 'TABLE', start: cell, end: cell, revealed: false },
      { word: 'QUERY', start: cell, end: cell, revealed: true },
    ];
    const play = {
      ...base,
      game: 'search',
      status: 'lost',
      view: { kind: 'search', grid: [], words: ['QUERY', 'TABLE'], found, hints: [], misses: 0 },
    } as unknown as Play;
    expect(resultOf(play).summary).toBe('1 of 2 words found');
  });

  it('times a solved Sudoku', () => {
    const play = {
      ...base,
      game: 'sudoku',
      status: 'won',
      mistakes: 1,
      hints: 2,
      view: { kind: 'sudoku', difficulty: 'hard', givens: [], filled: [], hinted: [], wrong: null },
    } as unknown as Play;
    expect(resultOf(play).summary).toBe('Hard, 1 mistake, 2 hints in 1:15');
  });

  it('holds nothing back on a guest’s lost Daily Query: its answers show as they’re given', () => {
    const play = {
      ...base,
      game: 'quiz',
      status: 'lost',
      view: { kind: 'quiz', questions: [{}, {}], answered: [{ correct: false }, { correct: true }] },
    } as unknown as Play;
    expect(resultOf(play, true)).toMatchObject({ summary: '1 of 2 right', held: false });
  });
});

describe('statusOf', () => {
  const day = (status: GameDay['status'], extra: Partial<GameDay> = {}) =>
    ({ info: { id: 'word', maxPoints: 100 }, status, points: 0, scored: false, variant: '', ...extra }) as GameDay;

  it('says how a game stands in a word or two', () => {
    expect(statusOf(day('new'))).toEqual({ label: 'New', tone: 'new' });
    expect(statusOf(day('playing')).label).toBe('Playing');
    expect(statusOf(day('won', { scored: true, points: 90 })).label).toBe('Solved · +90');
    expect(statusOf(day('won')).label).toBe('Solved');
    expect(statusOf(day('lost', { scored: true })).label).toBe('Not solved');
  });
});
