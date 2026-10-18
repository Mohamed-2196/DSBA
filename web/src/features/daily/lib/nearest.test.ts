import { describe, expect, it } from 'vitest';
import { band, bestRank, byCloseness, closeness } from './nearest';

describe('ranks', () => {
  it('bands a rank like the share text does', () => {
    expect(band(1)).toBe('found');
    expect(band(50)).toBe('close');
    expect(band(51)).toBe('warm');
    expect(band(200)).toBe('warm');
    expect(band(201)).toBe('cold');
  });

  it('spreads closeness out at the near end', () => {
    expect(closeness(1, 483)).toBe(1);
    expect(closeness(483, 483)).toBe(0);
    expect(closeness(10, 483)).toBeGreaterThan(0.6);
    expect(closeness(250, 483)).toBeLessThan(0.15);
  });

  it('sorts closest first and keeps the order of ties', () => {
    const guesses = [
      { word: 'money', rank: 40, hint: false },
      { word: 'bank', rank: 12, hint: false },
      { word: 'loan', rank: 40, hint: true },
    ];
    expect(byCloseness(guesses).map((g) => g.word)).toEqual(['bank', 'money', 'loan']);
    expect(bestRank(guesses)).toBe(12);
    expect(bestRank([])).toBeNull();
  });
});
