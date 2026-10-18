// DSBA Hub — degree classification, by the rules admins keep in Manage → Grades calculator (GET /grades/rules).
//
// The subjects come in the rules' order. Each counts as 1, 2 or 3 classification marks, or "average": those are
// averaged together and the average counts as rules.averageCounts marks. A classification mark under the Third's
// floor means a resit; a class is given by rules.needed marks in its band or a higher one, or rules.fewer of them with
// an average classification mark of at least the class's average. Marks are the raw input strings read with Number(),
// so a blank field counts as 0. A fail still gets a fresh breakdown and average; the classification label doesn't
// depend on them.
//
// Pure module: no React. Everything stays in the browser: marks are never sent to the server.
import type { GradeRules, GradeSubject } from '../../api/types';

export type Rules = GradeRules;
export type ChoiceSlot = NonNullable<GradeSubject['choice']>;
export type Picks = Partial<Record<ChoiceSlot, string>>;
export type ClassKind = 'first' | 'upper' | 'lower' | 'third' | 'none' | 'resit';
export type BandId = 'first' | 'upper' | 'lower' | 'third' | 'fail';
export type TargetKind = Exclude<ClassKind, 'none' | 'resit'>;

/** A subject with its place in the calculator. */
export interface Subject extends GradeSubject {
  index: number;
}

export function subjectsOf(rules: Rules): Subject[] {
  return rules.subjects.map((s, index) => ({ ...s, index }));
}

/** The subjects counted through their average, by index. */
export function pooledIndexes(rules: Rules): number[] {
  return rules.subjects.flatMap((s, i) => (s.counts === 'average' ? [i] : []));
}

/** Classification marks when every subject has one. */
export function totalMarks(rules: Rules): number {
  const pooled = rules.subjects.some((s) => s.counts === 'average') ? rules.averageCounts : 0;
  return rules.subjects.reduce((sum, s) => sum + (s.counts === 'average' ? 0 : s.counts), pooled);
}

/** The result strings. */
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

/** The lowest mark of a class's band (First → 70 …). */
export const bandFloor = (rules: Rules, kind: TargetKind): number => rules.bands[kind].floor;

/** Band key for a number. */
export function bandOf(grade: number, rules: Rules): BandId {
  const { first, upper, lower, third } = rules.bands;
  if (grade >= first.floor) return 'first';
  if (grade >= upper.floor) return 'upper';
  if (grade >= lower.floor) return 'lower';
  if (grade >= third.floor) return 'third';
  return 'fail';
}

const DESCRIPTION: Record<BandId, string> = { first: 'First Class', upper: 'Upper Second Class', lower: 'Lower Second Class', third: 'Third Class', fail: 'Fail' };

/** A mark's class, in words. */
export const gradeDescription = (grade: number, rules: Rules): string => DESCRIPTION[bandOf(grade, rules)];

/** One raw value per subject ('' for a missing or unreadable entry). */
export function normalizeGrades(grades: unknown, rules: Rules): string[] {
  const count = rules.subjects.length;
  const out: string[] = Array<string>(count).fill('');
  if (Array.isArray(grades)) {
    for (let i = 0; i < count; i += 1) {
      const g: unknown = grades[i];
      out[i] = g == null ? '' : typeof g === 'number' ? String(g) : typeof g === 'string' ? g : '';
    }
  }
  return out;
}

/** Every subject has a mark above 0: the whole result can show. */
export function isComplete(grades: readonly string[]): boolean {
  return grades.every((grade) => grade && !isNaN(Number(grade)) && Number(grade) > 0);
}

/** Nothing meaningful entered yet ("getting started"). */
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
  /** the result string */
  label: string;
  /** a classification mark under the Third's floor (blank fields count as 0) */
  failed: boolean;
  /** every subject has a mark (isComplete) */
  complete: boolean;
  /** nothing entered yet (isEmpty) */
  empty: boolean;
  /** classification marks: the average of the averaged subjects first, then the others in subject order */
  marks: ClassificationMark[];
  breakdown: { firstClass: number; upperSecondClass: number; lowerSecondClass: number; thirdClass: number };
  /** average classification mark (0 when there are no marks) */
  average: number;
  /** the average of the subjects counted through it, once they can all be read (null otherwise) */
  groupAverage: number | null;
}

/** Classify one raw mark string per subject ('' = blank), by `rules`. */
export function classify(input: unknown, rules: Rules): Classification {
  const grades = normalizeGrades(input, rules);
  const classificationMarks: number[] = [];
  const sources: number[][] = [];

  // The averaged subjects: their average counts as rules.averageCounts marks, once every one can be read.
  const pooled = pooledIndexes(rules);
  const pooledGrades = pooled.map((i) => Number(grades[i])).filter((g) => !isNaN(g));
  let groupAverage: number | null = null;
  if (pooled.length && pooledGrades.length === pooled.length) {
    groupAverage = pooledGrades.reduce((sum, grade) => sum + grade, 0) / pooledGrades.length;
    classificationMarks.push(...Array<number>(rules.averageCounts).fill(groupAverage));
    for (let k = 0; k < rules.averageCounts; k += 1) sources.push(pooled);
  }

  // Every other subject: its mark, as many times as it counts.
  rules.subjects.forEach((s, i) => {
    if (s.counts === 'average') return;
    const g = Number(grades[i]);
    if (isNaN(g)) return;
    classificationMarks.push(...Array<number>(s.counts).fill(g));
    for (let k = 0; k < s.counts; k += 1) sources.push([i]);
  });

  const { first, upper, lower, third } = rules.bands;
  const failed = classificationMarks.some((g) => g < third.floor);
  const firstClass = classificationMarks.filter((g) => g >= first.floor).length;
  const upperSecondClass = classificationMarks.filter((g) => g >= upper.floor && g < first.floor).length;
  const lowerSecondClass = classificationMarks.filter((g) => g >= lower.floor && g < upper.floor).length;
  const thirdClass = classificationMarks.filter((g) => g >= third.floor && g < lower.floor).length;
  const average = classificationMarks.length > 0 ? classificationMarks.reduce((sum, grade) => sum + grade, 0) / classificationMarks.length : 0;

  const { needed, fewer, averages } = rules;
  const reaches = (marks: number, bar: number | null) => marks >= needed || (bar != null && marks >= fewer && average >= bar);
  let kind: ClassKind;
  if (failed) kind = 'resit';
  else if (reaches(firstClass, averages.first)) kind = 'first';
  else if (reaches(firstClass + upperSecondClass, averages.upper)) kind = 'upper';
  else if (reaches(firstClass + upperSecondClass + lowerSecondClass, averages.lower)) kind = 'lower';
  else if (reaches(firstClass + upperSecondClass + lowerSecondClass + thirdClass, null)) kind = 'third';
  else kind = 'none';

  return {
    kind,
    label: RESULT[kind],
    failed,
    complete: isComplete(grades),
    empty: isEmpty(grades),
    marks: classificationMarks.map((value, k) => ({ value, source: sources[k] ?? [] })),
    breakdown: { firstClass, upperSecondClass, lowerSecondClass, thirdClass },
    average,
    groupAverage,
  };
}
