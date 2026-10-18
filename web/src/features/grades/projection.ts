// Your projected class from the calculator's marks, for other pages (Career Navigator, Results day). Pure: the marks
// come from this browser's storage and never leave it.
import { classify, normalizeGrades, pooledIndexes, type ClassKind, type Rules } from './classify';
import { NEXT_CLASS, targetsForRemaining, type TargetKind } from './whatif';

export interface NextClass {
  kind: TargetKind;
  /** the mark needed in every module still blank; null when even 100s wouldn't reach it */
  mark: number | null;
  blanks: number;
}

export type Projection =
  | { state: 'empty' }
  /** at least one entered mark is under the pass mark: subject indexes, in order */
  | { state: 'fail'; failing: number[] }
  | { state: 'complete'; kind: ClassKind; average: number }
  /** `kind`: the class if every blank module scores the average so far */
  | { state: 'partial'; kind: ClassKind; average: number; entered: number; next: NextClass | null };

/** How much a subject weighs in the classification: the averaged subjects share the marks of their average. */
function weightOf(i: number, rules: Rules): number {
  const s = rules.subjects[i];
  if (!s) return 0;
  return s.counts === 'average' ? rules.averageCounts / pooledIndexes(rules).length : s.counts;
}

const readMark = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export function projectClass(input: unknown, rules: Rules): Projection {
  const marks = normalizeGrades(input, rules).map(readMark);
  const entered = marks.flatMap((m, i) => (m === null ? [] : [{ i, m }]));
  if (!entered.length) return { state: 'empty' };

  const failing = entered.filter(({ m }) => m < rules.bands.third.floor).map(({ i }) => i);
  if (failing.length) return { state: 'fail', failing };

  const weight = entered.reduce((sum, { i }) => sum + weightOf(i, rules), 0);
  const average = entered.reduce((sum, { i, m }) => sum + weightOf(i, rules) * m, 0) / weight;
  if (entered.length === rules.subjects.length) {
    const result = classify(
      marks.map((m) => String(m)),
      rules,
    );
    return { state: 'complete', kind: result.kind, average: result.average };
  }

  const filled = marks.map((m) => String(m ?? average));
  const kind = classify(filled, rules).kind;
  const nextKind = NEXT_CLASS[kind];
  const target = nextKind
    ? targetsForRemaining(
        marks.map((m) => (m === null ? '' : String(m))),
        rules,
      ).find((t) => t.kind === nextKind)
    : undefined;
  return {
    state: 'partial',
    kind,
    average,
    entered: entered.length,
    next: target ? { kind: target.kind, mark: target.mark, blanks: target.blanks } : null,
  };
}
