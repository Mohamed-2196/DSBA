// DSBA Hub — degree classification, ported from v1 src/legacy/components/gpa/GPACalculator.tsx.
//
// The algorithm is the v1 algorithm, line for line: same 13 subjects in the same order, same
// weighting, same use of Number() on the raw input strings (so a blank field counts as 0, exactly
// like v1), same summation order (floating point results are bit-identical), same thresholds and
// the same result strings.
//
// The only difference: v1 returned early on a fail without updating its breakdown/average state
// (so the screen kept stale numbers). This function always returns a fresh breakdown and average;
// the classification label is unaffected.
//
// Pure module: no React, no imports. Everything stays in the browser: marks are never sent to the server.

export type ChoiceSlot = 'year2Option' | 'elective1' | 'elective2';
export type Picks = Partial<Record<ChoiceSlot, string>>;
export type ClassKind = 'first' | 'upper' | 'lower' | 'third' | 'none' | 'resit';
export type BandId = 'first' | 'upper' | 'lower' | 'third' | 'fail';

export interface Subject {
  index: number;
  v1Name: string;
  year: 1 | 2 | 3;
  group: 'year1' | 'advancedStats' | 'remaining';
  /** Classification marks the subject contributes (Year 1 counts through its average). */
  weight?: number;
  moduleId: string | null;
  choice?: ChoiceSlot;
}

/** The v1 subject list, in v1 order. `weight` = classification marks the subject contributes. */
export const SUBJECTS: Subject[] = [
  // Year 1: the four marks are averaged, and the average counts as 2 classification marks.
  { index: 0, v1Name: 'Introduction to Economics', year: 1, group: 'year1', moduleId: 'economics' },
  { index: 1, v1Name: 'Mathematical Methods', year: 1, group: 'year1', moduleId: 'mathematics' },
  { index: 2, v1Name: 'Business and Management in a Global Context', year: 1, group: 'year1', moduleId: 'business' },
  { index: 3, v1Name: 'Introduction to Mathematical Statistics', year: 1, group: 'year1', moduleId: 'statistics' },
  // Year 2: each Advanced Statistics module counts as 1 mark; the rest count as 2 marks each.
  { index: 4, v1Name: 'Advanced Statistics: Statistical Inference', year: 2, group: 'advancedStats', weight: 1, moduleId: 'advanced-stats-inferential' },
  { index: 5, v1Name: 'Advanced Statistics: Distribution Theory', year: 2, group: 'advancedStats', weight: 1, moduleId: 'advanced-stats-distribution' },
  { index: 6, v1Name: 'Business Analytics: Applied Modelling and Prediction', year: 2, group: 'remaining', weight: 2, moduleId: 'business-analytics' },
  { index: 7, v1Name: 'Programming for Data Science', year: 2, group: 'remaining', weight: 2, moduleId: 'programming-data-science' },
  { index: 8, v1Name: 'Abstract Mathematics/Information Systems/Econometrics', year: 2, group: 'remaining', weight: 2, moduleId: null, choice: 'year2Option' },
  // Year 3
  { index: 9, v1Name: 'Statistical Methods for Market Research', year: 3, group: 'remaining', weight: 2, moduleId: 'market-research' },
  { index: 10, v1Name: 'Machine Learning', year: 3, group: 'remaining', weight: 2, moduleId: 'machine-learning' },
  { index: 11, v1Name: 'Elective1', year: 3, group: 'remaining', weight: 2, moduleId: null, choice: 'elective1' },
  { index: 12, v1Name: 'Elective2', year: 3, group: 'remaining', weight: 2, moduleId: null, choice: 'elective2' },
];

export const SUBJECT_COUNT = SUBJECTS.length; // 13
/** Classification marks when every subject is entered: 2 (Year 1 average) + 1 + 1 + 7 × 2. */
export const TOTAL_CLASSIFICATION_MARKS = 18;

/** v1 result strings (verbatim). */
export const RESULT: Record<ClassKind, string> = {
  first: 'First Class Honours',
  upper: 'Upper Second Class Honours',
  lower: 'Lower Second Class Honours',
  third: 'Third Class Honours',
  none: 'Not Classified',
  resit: 'Resit required for failed subjects to pass the degree',
};

/** Order of the outcomes, worst to best (for "at least" comparisons in what-if searches). */
export const RANK: Record<ClassKind, number> = { resit: 0, none: 1, third: 2, lower: 3, upper: 4, first: 5 };

/** v1 getGradeDescription (verbatim thresholds and strings). */
export function gradeDescription(grade: number): string {
  if (grade >= 70) return 'First Class';
  if (grade >= 60) return 'Upper Second Class';
  if (grade >= 50) return 'Lower Second Class';
  if (grade >= 40) return 'Third Class';
  return 'Fail';
}

/** Band key for a number. Same thresholds as v1. */
export function bandOf(grade: number): BandId {
  if (grade >= 70) return 'first';
  if (grade >= 60) return 'upper';
  if (grade >= 50) return 'lower';
  if (grade >= 40) return 'third';
  return 'fail';
}

/** Always 13 raw values (v1 kept an array of 13 strings; missing entries behave like v1's ''). */
export function normalizeGrades(grades: unknown): string[] {
  const out: string[] = Array<string>(SUBJECT_COUNT).fill('');
  if (Array.isArray(grades)) {
    for (let i = 0; i < SUBJECT_COUNT; i += 1) {
      const g: unknown = grades[i];
      out[i] = g == null ? '' : typeof g === 'number' ? String(g) : typeof g === 'string' ? g : '';
    }
  }
  return out;
}

/**
 * v1 display rule: the result section only showed when every subject had a mark above 0
 * (`grades.every(grade => grade && !isNaN(Number(grade)) && Number(grade) > 0)`).
 */
export function isComplete(grades: readonly string[]): boolean {
  return grades.every((grade) => grade && !isNaN(Number(grade)) && Number(grade) > 0);
}

/** v1 "getting started" rule: nothing meaningful entered yet. */
export function isEmpty(grades: readonly string[]): boolean {
  return grades.every((grade) => !grade || isNaN(Number(grade)) || Number(grade) === 0);
}

export interface ClassificationMark {
  value: number;
  /** The subject indexes the mark comes from. */
  source: number[];
}

export interface Classification {
  kind: ClassKind;
  /** v1 result string */
  label: string;
  /** a classification mark under 40 (blank fields count as 0, as in v1) */
  failed: boolean;
  /** v1's rule for showing the result */
  complete: boolean;
  /** v1's "getting started" rule */
  empty: boolean;
  /** classification marks, v1 order */
  marks: ClassificationMark[];
  breakdown: { firstClass: number; upperSecondClass: number; lowerSecondClass: number; thirdClass: number };
  /** average classification mark (v1: 0 when there are no marks) */
  average: number;
  yearOneAverage: number | null;
}

/** Classify 13 raw mark strings exactly like v1 ('' = blank). */
export function classify(input: unknown): Classification {
  const grades = normalizeGrades(input);

  // ── v1 useEffect, line for line ─────────────────────────────────────────────
  const classificationMarks: number[] = [];
  const sources: number[][] = [];

  // Year 1 subjects (first 4): averaged, the average counted as 2 marks
  const yearOneGrades = grades
    .slice(0, 4)
    .map(Number)
    .filter((g) => !isNaN(g));
  let yearOneAverage: number | null = null;
  if (yearOneGrades.length === 4) {
    yearOneAverage = yearOneGrades.reduce((sum, grade) => sum + grade, 0) / yearOneGrades.length;
    classificationMarks.push(...Array<number>(2).fill(yearOneAverage));
    sources.push([0, 1, 2, 3], [0, 1, 2, 3]);
  }

  // Advanced Statistics (subjects 5 and 6): each counted as 1 mark
  const advanced = [4, 5].map((i) => ({ i, g: Number(grades[i]) })).filter(({ g }) => !isNaN(g));
  advanced.forEach(({ i, g }) => {
    classificationMarks.push(g);
    sources.push([i]);
  });

  // Remaining subjects (7 to 13): each counted as 2 marks
  const remaining = grades
    .slice(6)
    .map((raw, k) => ({ i: k + 6, g: Number(raw) }))
    .filter(({ g }) => !isNaN(g));
  remaining.forEach(({ i, g }) => {
    classificationMarks.push(...Array<number>(2).fill(g));
    sources.push([i], [i]);
  });

  const failed = classificationMarks.some((g) => g < 40);

  const firstClass = classificationMarks.filter((g) => g >= 70).length;
  const upperSecondClass = classificationMarks.filter((g) => g >= 60 && g < 70).length;
  const lowerSecondClass = classificationMarks.filter((g) => g >= 50 && g < 60).length;
  const thirdClass = classificationMarks.filter((g) => g >= 40 && g < 50).length;

  const average = classificationMarks.length > 0 ? classificationMarks.reduce((sum, grade) => sum + grade, 0) / classificationMarks.length : 0;

  let kind: ClassKind;
  if (failed) kind = 'resit';
  else if (firstClass >= 10 || (firstClass >= 8 && average >= 65)) kind = 'first';
  else if (upperSecondClass + firstClass >= 10 || (upperSecondClass + firstClass >= 8 && average >= 56)) kind = 'upper';
  else if (lowerSecondClass + upperSecondClass + firstClass >= 10 || (lowerSecondClass + upperSecondClass + firstClass >= 8 && average >= 47)) kind = 'lower';
  else if (thirdClass + lowerSecondClass + upperSecondClass + firstClass >= 10) kind = 'third';
  else kind = 'none';
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    kind,
    label: RESULT[kind],
    failed,
    complete: isComplete(grades),
    empty: isEmpty(grades),
    marks: classificationMarks.map((value, k) => ({ value, source: sources[k] ?? [] })),
    breakdown: { firstClass, upperSecondClass, lowerSecondClass, thirdClass },
    average,
    yearOneAverage,
  };
}

/** True when `a` is the same outcome as `b` or better. */
export function atLeast(kindA: ClassKind, kindB: ClassKind): boolean {
  return RANK[kindA] >= RANK[kindB];
}
