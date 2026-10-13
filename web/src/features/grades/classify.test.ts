// The degree classification: its rules, checked on whole sets of marks.
import { describe, expect, it } from 'vitest';
import { bandOf, classify, gradeDescription, isComplete, isEmpty, normalizeGrades, RESULT, SUBJECT_COUNT, TOTAL_CLASSIFICATION_MARKS } from './classify';

/** 13 marks: `fill` everywhere, with some subjects (by index) set apart. */
const marks = (fill: number | string, set: Record<number, number | string> = {}): string[] =>
  Array.from({ length: SUBJECT_COUNT }, (_, i) => String(set[i] ?? fill));

describe('classify', () => {
  it('gives a First when every mark is a first', () => {
    const c = classify(marks(75));
    expect(c.kind).toBe('first');
    expect(c.label).toBe('First Class Honours');
    expect(c.marks).toHaveLength(TOTAL_CLASSIFICATION_MARKS);
    expect(c.average).toBe(75);
    expect(c.complete).toBe(true);
    expect(c.failed).toBe(false);
  });

  it('counts the Year 1 average twice, the Advanced Statistics modules once and the rest twice', () => {
    const c = classify(marks(60, { 0: 80, 1: 60, 2: 70, 3: 50 }));
    expect(c.yearOneAverage).toBe(65);
    expect(c.marks.slice(0, 2)).toEqual([
      { value: 65, source: [0, 1, 2, 3] },
      { value: 65, source: [0, 1, 2, 3] },
    ]);
    expect(c.marks.slice(2, 4).map((m) => m.source)).toEqual([[4], [5]]);
    expect(c.marks.slice(4).map((m) => m.source[0])).toEqual([6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12]);
  });

  it('gives a First for 8 first-class marks when the average is 65 or more', () => {
    // Year 1 (2 marks), both Advanced Statistics (2) and two more modules (4): 8 marks of 72; the rest 64
    const c = classify(marks(64, { 0: 72, 1: 72, 2: 72, 3: 72, 4: 72, 5: 72, 6: 72, 7: 72 }));
    expect(c.breakdown.firstClass).toBe(8);
    expect(c.average).toBeCloseTo(1216 / 18, 10);
    expect(c.kind).toBe('first');
  });

  it('gives an Upper Second for the same 8 firsts when the average is under 65', () => {
    const c = classify(marks(58, { 0: 72, 1: 72, 2: 72, 3: 72, 4: 72, 5: 72, 6: 72, 7: 72 }));
    expect(c.average).toBeCloseTo(1156 / 18, 10);
    expect(c.kind).toBe('upper');
    expect(c.label).toBe(RESULT.upper);
  });

  it('gives a Lower Second and a Third on the same rules', () => {
    expect(classify(marks(55)).kind).toBe('lower');
    expect(classify(marks(45)).kind).toBe('third');
  });

  it('asks for a resit when any classification mark is under 40', () => {
    const c = classify(marks(70, { 7: 35 }));
    expect(c.failed).toBe(true);
    expect(c.kind).toBe('resit');
    expect(c.label).toBe('Resit required for failed subjects to pass the degree');
  });

  it('counts a blank mark as 0, and does not call the set complete', () => {
    const c = classify(marks(60, { 12: '' }));
    expect(c.kind).toBe('resit');
    expect(c.complete).toBe(false);
    expect(c.empty).toBe(false);
  });

  it('ignores what is not a number', () => {
    const c = classify(marks('abc'));
    expect(c.marks).toEqual([]);
    expect(c.average).toBe(0);
    expect(c.kind).toBe('none');
    expect(c.yearOneAverage).toBeNull();
  });

  it('knows an empty sheet', () => {
    const c = classify(marks(''));
    expect(c.empty).toBe(true);
    expect(c.complete).toBe(false);
  });
});

describe('the helpers', () => {
  it('always gives 13 strings', () => {
    const out = normalizeGrades([70, '65', null, undefined, {}]);
    expect(out).toHaveLength(SUBJECT_COUNT);
    expect(out.slice(0, 6)).toEqual(['70', '65', '', '', '', '']);
    expect(normalizeGrades('not a list')).toEqual(Array<string>(SUBJECT_COUNT).fill(''));
  });

  it('puts a mark in its band at the class thresholds', () => {
    expect([70, 69.99, 60, 59.5, 50, 40, 39.9].map(bandOf)).toEqual(['first', 'upper', 'upper', 'lower', 'lower', 'third', 'fail']);
    expect([70, 60, 50, 40, 39].map(gradeDescription)).toEqual(['First Class', 'Upper Second Class', 'Lower Second Class', 'Third Class', 'Fail']);
  });

  it('calls a sheet complete only when every mark is above 0', () => {
    expect(isComplete(marks(50))).toBe(true);
    expect(isComplete(marks(50, { 3: '0' }))).toBe(false);
    expect(isEmpty(marks('0'))).toBe(true);
    expect(isEmpty(marks('', { 5: 41 }))).toBe(false);
  });
});
