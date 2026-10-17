import { describe, expect, it } from 'vitest';
import { keepOrder, shuffled, tryLevels, wordFit } from './groups';

describe('keepOrder', () => {
  it('keeps the player’s order and drops the words that left the board', () => {
    expect(keepOrder(['D', 'A', 'C', 'B'], ['A', 'B', 'C'])).toEqual(['A', 'C', 'B']);
  });

  it('takes the server’s order before the player shuffles', () => {
    expect(keepOrder(null, ['A', 'B'])).toEqual(['A', 'B']);
  });

  it('adds words it hasn’t seen at the end', () => {
    expect(keepOrder(['B'], ['A', 'B'])).toEqual(['B', 'A']);
  });
});

describe('shuffled', () => {
  it('keeps every word', () => {
    const words = ['A', 'B', 'C', 'D', 'E'];
    expect(shuffled(words, () => 0.3).sort()).toEqual(words);
  });
});

describe('wordFit', () => {
  it('shrinks long words', () => {
    expect(wordFit('MEAN')).toBe('md');
    expect(wordFit('MIDRANGE')).toBe('sm');
    expect(wordFit('PROBABILITY')).toBe('xs');
  });
});

describe('tryLevels', () => {
  it('turns each try into its groups’ levels, lowest first', () => {
    const groups = [
      { label: 'One', level: 1, words: ['A', 'B', 'C', 'D'] },
      { label: 'Four', level: 4, words: ['E', 'F', 'G', 'H'] },
    ];
    expect(tryLevels([['E', 'A', 'B', 'C'], ['E', 'F', 'G', 'H']], groups)).toEqual([
      [1, 1, 1, 4],
      [4, 4, 4, 4],
    ]);
  });
});
