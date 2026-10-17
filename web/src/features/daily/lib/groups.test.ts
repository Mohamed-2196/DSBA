import { describe, expect, it } from 'vitest';
import { breakable, keepOrder, shuffled, tryLevels } from './groups';

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

describe('breakable', () => {
  it('lets only long words break, and never near an end', () => {
    expect(breakable('SCHEMA')).toBe('SCHEMA');
    const soft = breakable('CARDINALITY');
    expect(soft.replace(/\u00AD/g, '')).toBe('CARDINALITY');
    expect(soft.startsWith('CAR\u00AD')).toBe(true);
    expect(soft.endsWith('L\u00ADITY')).toBe(true); // the last line keeps at least three letters
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
