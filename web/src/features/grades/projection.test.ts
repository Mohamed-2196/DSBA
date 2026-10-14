import { describe, expect, it } from 'vitest';
import { SUBJECT_COUNT } from './classify';
import { projectClass } from './projection';

/** 13 marks: `fill` everywhere, with some subjects (by index) set apart. */
const marks = (fill: number | string, set: Record<number, number | string> = {}): string[] =>
  Array.from({ length: SUBJECT_COUNT }, (_, i) => String(set[i] ?? fill));

describe('projectClass', () => {
  it('says nothing is entered for blanks or junk', () => {
    expect(projectClass(marks(''))).toEqual({ state: 'empty' });
    expect(projectClass(null)).toEqual({ state: 'empty' });
    expect(projectClass(marks('', { 3: 'abc' }))).toEqual({ state: 'empty' });
  });

  it('lists every entered mark under 40', () => {
    expect(projectClass(marks('', { 0: 62, 4: 38, 9: 12 }))).toEqual({ state: 'fail', failing: [4, 9] });
  });

  it('gives the calculated class once every mark is in', () => {
    expect(projectClass(marks(72))).toEqual({ state: 'complete', kind: 'first', average: 72 });
    expect(projectClass(marks(55))).toMatchObject({ state: 'complete', kind: 'lower' });
  });

  it('projects partial marks at their weighted average and names the next class', () => {
    // Year 1 at 64 (2 classification marks' worth) and Business Analytics at 70 (2): the average is 67.
    const p = projectClass(marks('', { 0: 64, 1: 64, 2: 64, 3: 64, 6: 70 }));
    expect(p).toMatchObject({ state: 'partial', kind: 'upper', entered: 5 });
    if (p.state !== 'partial') throw new Error('expected partial');
    expect(p.average).toBeCloseTo(67);
    expect(p.next).toEqual({ kind: 'first', mark: 70, blanks: 8 });
  });

  it('doesn’t round an average up into the next class', () => {
    // Year 1 at 69 and 70 alternately averages 69.5: under a First's 70, so the projection stays a 2:1.
    const p = projectClass(marks('', { 0: 69, 1: 70, 2: 69, 3: 70 }));
    expect(p).toMatchObject({ state: 'partial', kind: 'upper' });
  });

  it('has no next class above a First', () => {
    const p = projectClass(marks('', { 0: 80, 1: 80, 2: 80, 3: 80 }));
    expect(p).toMatchObject({ state: 'partial', kind: 'first', next: null });
  });

  it('weighs an Advanced Statistics module half as much as a full module', () => {
    const p = projectClass(marks('', { 4: 50, 6: 80 }));
    if (p.state !== 'partial') throw new Error('expected partial');
    expect(p.average).toBeCloseTo((50 + 2 * 80) / 3);
  });
});
