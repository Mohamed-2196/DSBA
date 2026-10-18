// The "what if" hints: each answer checked against marks worked out by hand.
import { describe, expect, it } from 'vitest';
import type { GradeRules } from '../../api/types';
import { readSeed } from '../../testing/seed';
import * as whatif from './whatif';

// The rules as the hub starts with them: today's programme regulations (api/app/seed/data/grades.json).
const RULES = readSeed<GradeRules>('grades');
const SUBJECT_COUNT = RULES.subjects.length;
const blankIndexes = (g: unknown) => whatif.blankIndexes(g, RULES);
const targetsForRemaining = (g: unknown) => whatif.targetsForRemaining(g, RULES);
const improvementPlan = (g: unknown) => whatif.improvementPlan(g, RULES);
const holdingFloors = (g: unknown) => whatif.holdingFloors(g, RULES);
const resitOutlook = (g: unknown) => whatif.resitOutlook(g, RULES);

/** A mark per subject: `fill` everywhere, with some subjects (by index) set apart. */
const marks = (fill: number | string, set: Record<number, number | string> = {}): string[] =>
  Array.from({ length: SUBJECT_COUNT }, (_, i) => String(set[i] ?? fill));

describe('blankIndexes', () => {
  it('lists the subjects with no mark, whatever the input', () => {
    expect(blankIndexes(marks(60, { 2: '', 9: '  ' }))).toEqual([2, 9]);
    expect(blankIndexes(null)).toHaveLength(SUBJECT_COUNT);
  });
});

describe('targetsForRemaining', () => {
  it('has nothing to say once every mark is in', () => {
    expect(targetsForRemaining(marks(60))).toEqual([]);
  });

  it('gives each band floor when nothing is entered yet', () => {
    expect(targetsForRemaining(marks(''))).toEqual([
      { kind: 'first', mark: 70, blanks: 13 },
      { kind: 'upper', mark: 60, blanks: 13 },
      { kind: 'lower', mark: 50, blanks: 13 },
      { kind: 'third', mark: 40, blanks: 13 },
    ]);
  });

  it('says a class is out of reach when the blanks alone cannot carry it', () => {
    // 16 classification marks of 60 are in: an Upper Second whatever the last subject scores (40 or more),
    // and a First needs at least 8 first-class marks, which one subject (2 marks) can't give.
    expect(targetsForRemaining(marks(60, { 12: '' }))).toEqual([
      { kind: 'first', mark: null, blanks: 1 },
      { kind: 'upper', mark: 40, blanks: 1 },
      { kind: 'lower', mark: 40, blanks: 1 },
      { kind: 'third', mark: 40, blanks: 1 },
    ]);
  });

  it('says every class is out of reach after a failed mark', () => {
    const targets = targetsForRemaining(marks('', { 7: 35 }));
    expect(targets.map((t) => t.mark)).toEqual([null, null, null, null]);
    expect(targets.every((t) => t.blanks === 12)).toBe(true);
  });
});

describe('improvementPlan', () => {
  it('has no plan for incomplete marks, a resit or a First', () => {
    expect(improvementPlan(marks(60, { 3: '' }))).toBeNull();
    expect(improvementPlan(marks(60, { 7: 35 }))).toBeNull();
    expect(improvementPlan(marks(75))).toBeNull();
  });

  it('raises one module when that is enough', () => {
    // 6 upper-second marks (6, 7, 8) and 12 of 55: a Lower Second. One more module at 60 makes 8 with an
    // average of 57.2, an Upper Second; the first of the cheapest (5 points) is taken.
    const g = marks(55, { 6: 60, 7: 60, 8: 60 });
    expect(improvementPlan(g)).toEqual({
      target: 'upper',
      changes: [{ index: 9, from: 55, to: 60 }],
      delta: 5,
      marks: marks(55, { 6: 60, 7: 60, 8: 60, 9: 60 }),
    });
  });

  it('raises several modules to the band that counts when one is not enough', () => {
    // All 55: no single mark gets an Upper Second. Raising four double-weight modules to 60 gives 8 upper-second
    // marks and an average of 57.2.
    const plan = improvementPlan(marks(55));
    expect(plan).toEqual({
      target: 'upper',
      changes: [6, 7, 8, 9].map((index) => ({ index, from: 55, to: 60 })),
      delta: 20,
      marks: marks(55, { 6: 60, 7: 60, 8: 60, 9: 60 }),
    });
  });
});

describe('holdingFloors', () => {
  it('has no floors for incomplete marks or a resit', () => {
    expect(holdingFloors(marks(75, { 0: '' }))).toBeNull();
    expect(holdingFloors(marks(75, { 7: 35 }))).toBeNull();
  });

  it('lets a Year 1 mark fall further than the others, since only the average counts', () => {
    // All 75 (a First with 18 first-class marks). A Year 1 mark at 0 still leaves an average of 56.25 and 16
    // firsts; any other module can fall to 40 before it fails.
    const floors = holdingFloors(marks(75));
    expect(floors).toHaveLength(SUBJECT_COUNT);
    expect(floors?.map((f) => f.floor)).toEqual([0, 0, 0, 0, 40, 40, 40, 40, 40, 40, 40, 40, 40]);
    expect(floors?.every((f) => f.from === 75)).toBe(true);
  });

  it('stops where the class would drop', () => {
    // 10 first-class marks (Year 1, 6, 7, 8, 9 at 75; the rest 60). Module 6 falling under 70 leaves 8 firsts,
    // still a First while the average is 65 or more: (1080 + 2 × 45) / 18 = 65 holds, 44 doesn't.
    const g = marks(60, { 0: 75, 1: 75, 2: 75, 3: 75, 6: 75, 7: 75, 8: 75, 9: 75 });
    const floors = holdingFloors(g);
    expect(floors?.[6]).toEqual({ index: 6, from: 75, floor: 45 });
    expect(floors?.[12]).toEqual({ index: 12, from: 60, floor: 40 });
  });
});

describe('resitOutlook', () => {
  it('is only for marks with a fail', () => {
    expect(resitOutlook(marks(60))).toBeNull();
    // a Year 1 mark under 40 doesn't fail on its own: the average (52.5) counts
    expect(resitOutlook(marks(60, { 0: 30 }))).toBeNull();
  });

  it('names the failed module and the outcome once it is passed with 40', () => {
    expect(resitOutlook(marks(60, { 7: 35 }))).toEqual({
      failing: [{ index: 7, mark: 35, blank: false }],
      groupAverageFails: false,
      outcome: 'upper',
      marks: marks(60, { 7: 40 }),
    });
  });

  it('counts a blank mark as a failed 0', () => {
    const outlook = resitOutlook(marks(60, { 12: '' }));
    expect(outlook?.failing).toEqual([{ index: 12, mark: 0, blank: true }]);
    expect(outlook?.outcome).toBe('upper');
  });

  it('names the Year 1 marks under 40 when the Year 1 average fails', () => {
    // average 20: modules 0 to 2 are resat, module 3 (50) stands; then the average is 42.5
    const outlook = resitOutlook(marks(60, { 0: 10, 1: 10, 2: 10, 3: 50 }));
    expect(outlook?.groupAverageFails).toBe(true);
    expect(outlook?.failing.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(outlook?.marks.slice(0, 4)).toEqual(['40', '40', '40', '50']);
    expect(outlook?.outcome).toBe('upper');
  });
});
