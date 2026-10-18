import { describe, expect, it } from 'vitest';
import type { GradeRules } from '../../api/types';
import { readSeed } from '../../testing/seed';
import { STORAGE_KEY, readRecord, storedRecord } from './record';

const RULES = readSeed<GradeRules>('grades');
const blank = RULES.subjects.map(() => '');

describe('readRecord', () => {
  it('keeps the calculator under a personal key, so signing out clears it', () => {
    expect(STORAGE_KEY.startsWith('hub.mine.')).toBe(true);
  });

  it('reads nothing usable as an empty record', () => {
    for (const raw of [null, undefined, 'x', 3, [], ['70'], { marks: ['70'] }]) {
      expect(readRecord(raw, RULES)).toEqual({ marks: blank, picks: {} });
    }
  });

  it('keeps the known picks that are strings, and drops the rest', () => {
    const picks = { year2Option: 'econometrics', elective1: '', elective2: 7, other: 'x' };
    expect(readRecord({ marks: null, picks }, RULES).picks).toEqual({ year2Option: 'econometrics' });
    expect(readRecord({ picks: ['econometrics'] }, RULES).picks).toEqual({});
  });

  it('reads each subject’s mark by its id, in the rules’ order', () => {
    const rec = readRecord({ marks: { mathematics: '70', economics: 64, 'no-such-subject': '90', business: {} } }, RULES);
    expect(rec.marks.slice(0, 3)).toEqual(['64', '70', '']);
  });
});

describe('storedRecord', () => {
  it('keeps marks by subject id, and a mark of a subject the rules leave out', () => {
    const marks = blank.slice();
    marks[1] = '70';
    expect(storedRecord({ marks, picks: { elective1: 'microeconomics' } }, RULES, { marks: { dissertation: '81', economics: '50' } })).toEqual({
      marks: { dissertation: '81', mathematics: '70' },
      picks: { elective1: 'microeconomics' },
    });
  });
});
