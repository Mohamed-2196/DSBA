import { describe, expect, it } from 'vitest';
import { normalizeGrades } from './classify';
import { STORAGE_KEY, readRecord } from './record';

describe('readRecord', () => {
  it('keeps the calculator under a personal key, so signing out clears it', () => {
    expect(STORAGE_KEY.startsWith('hub.mine.')).toBe(true);
  });

  it('reads nothing usable as an empty record', () => {
    for (const raw of [null, undefined, 'x', 3, [], ['70']]) {
      expect(readRecord(raw)).toEqual({ marks: normalizeGrades(null), picks: {} });
    }
  });

  it('keeps the known picks that are strings, and drops the rest', () => {
    const picks = { year2Option: 'econometrics', elective1: '', elective2: 7, other: 'x' };
    expect(readRecord({ marks: null, picks }).picks).toEqual({ year2Option: 'econometrics' });
    expect(readRecord({ picks: ['econometrics'] }).picks).toEqual({});
  });

  it('passes the marks through normalizeGrades', () => {
    const marks = ['70', 'abc'];
    expect(readRecord({ marks }).marks).toEqual(normalizeGrades(marks));
  });
});
