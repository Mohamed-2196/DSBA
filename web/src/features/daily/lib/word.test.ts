import { describe, expect, it } from 'vitest';
import { keyMarks, praise } from './word';

describe('keyMarks', () => {
  it('keeps the best a letter has shown across guesses', () => {
    const marks = keyMarks([
      { word: 'CRANE', marks: ['miss', 'near', 'miss', 'miss', 'hit'] },
      { word: 'TREND', marks: ['hit', 'hit', 'near', 'miss', 'miss'] },
    ]);
    expect(marks).toEqual({ C: 'miss', R: 'hit', A: 'miss', N: 'miss', E: 'hit', T: 'hit', D: 'miss' });
  });

  it('never lets a later miss hide a letter found before (a repeated letter)', () => {
    const marks = keyMarks([
      { word: 'SPEED', marks: ['hit', 'near', 'hit', 'miss', 'miss'] },
    ]);
    expect(marks.E).toBe('hit');
  });

  it('is empty before the first guess', () => {
    expect(keyMarks([])).toEqual({});
  });
});

describe('praise', () => {
  it('names a win by the guess that found it', () => {
    expect(praise(1)).toBe('In one!');
    expect(praise(6)).toBe('Phew');
    expect(praise(9)).toBe('Phew');
  });
});
