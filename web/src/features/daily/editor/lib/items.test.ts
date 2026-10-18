import { describe, expect, it } from 'vitest';
import {
  blankData,
  countsLine,
  fieldError,
  gameInfo,
  listWords,
  otherErrors,
  parseWords,
  rightOption,
  themeIdFrom,
  titleOf,
  usesLine,
} from './items';

describe('parseWords', () => {
  it('reads a group’s words however they are typed, in capitals, each once', () => {
    expect(parseWords('mean, median\nmode  midrange;MEAN')).toEqual(['MEAN', 'MEDIAN', 'MODE', 'MIDRANGE']);
    expect(parseWords('  ')).toEqual([]);
  });
});

describe('titleOf', () => {
  it('names an item by its word, its group or its question', () => {
    expect(titleOf({ game: 'word', word: 'TREND' })).toBe('TREND');
    expect(titleOf({ game: 'groups', label: 'Measures of centre', level: 1, words: [] })).toBe('Measures of centre');
    expect(titleOf({ game: 'quiz', question: 'Why?', options: [], answer: 0, explanation: '' })).toBe('Why?');
  });
});

describe('blankData', () => {
  it('starts each game’s item empty, with four options for a question', () => {
    expect(blankData('search')).toEqual({ game: 'search', word: '' });
    const quiz = blankData('quiz');
    expect(quiz.game === 'quiz' && quiz.options).toEqual(['', '', '', '']);
    expect(blankData('groups')).toEqual({ game: 'groups', label: '', level: 1, words: [] });
  });
});

describe('rightOption and listWords', () => {
  it('reads the right answer and lists words in a sentence', () => {
    expect(rightOption({ game: 'quiz', question: 'Q', options: ['A', 'B'], answer: 1, explanation: '' })).toBe('B');
    expect(listWords(['A', 'B', 'C'])).toBe('A, B and C');
    expect(listWords(['A'])).toBe('A');
  });
});

describe('field errors', () => {
  const fields = {
    'data.word': 'Answer words are five letters.',
    'data.groups.level': 'Too high.',
    theme: 'Pick a theme.',
  };

  it('finds a field’s message by its name, or by the schema’s game-qualified path', () => {
    expect(fieldError(fields, 'data.word')).toBe('Answer words are five letters.');
    expect(fieldError(fields, 'data.level')).toBe('Too high.');
    expect(fieldError(fields, 'data.label')).toBeUndefined();
  });

  it('keeps the messages of fields the form doesn’t show', () => {
    expect(otherErrors(fields, ['data.word', 'data.level'])).toEqual(['Pick a theme.']);
  });
});

describe('gameInfo', () => {
  it('describes every game the editor has', () => {
    expect(gameInfo('nearest').noun).toBe('secret word');
    expect(gameInfo('quiz').importHint).toContain('question, answer');
  });
});

describe('lines', () => {
  it('says what a theme has, and how often an item ran', () => {
    expect(countsLine({ word: 1, groups: 20, search: 0, quiz: 26, nearest: 2 })).toBe(
      '1 answer word · 20 groups · 0 search words · 26 questions · 2 secret words',
    );
    expect(usesLine(0, null, (d) => d)).toBe('Not run yet');
    expect(usesLine(3, '2026-10-12', (d) => `on ${d}`)).toBe('Ran on 3 days, last on 2026-10-12');
  });

  it('makes a theme id from its title', () => {
    expect(themeIdFrom('Exam week!')).toBe('exam-week');
    expect(themeIdFrom('  2026 Statistics & data ')).toBe('statistics-data');
    expect(themeIdFrom('A'.repeat(40))).toHaveLength(32);
  });
});
