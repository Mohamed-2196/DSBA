// The rules in words, for the calculator's explanations and its editor's preview: what each subject counts, as
// "Year 1 counts as one average worth 2 classification marks, ST2134 and ST2133 count 1 each, and every other module
// counts 2: 18 marks in all." Pure.
import { pooledIndexes, subjectsOf, totalMarks, type Rules, type Subject } from './classify';

export interface CountsSummary {
  /** the averaged subjects: what to call them ('Year 1', or '4 modules'), and what their average counts */
  pooled: { label: string; counts: number } | null;
  /** subjects that count differently from most, by what they count */
  special: { names: string[]; counts: number }[];
  /** what most subjects count (null when every subject is averaged) */
  rest: number | null;
  total: number;
}

export function countsSummary(rules: Rules, nameOf: (s: Subject) => string): CountsSummary {
  const subjects = subjectsOf(rules);
  const pooled = pooledIndexes(rules);
  const pooledYears = new Set(pooled.map((i) => rules.subjects[i]?.year));
  const [onlyYear] = [...pooledYears];
  const others = subjects.filter((s) => s.counts !== 'average');
  const tally = new Map<number, Subject[]>();
  for (const s of others) if (s.counts !== 'average') tally.set(s.counts, [...(tally.get(s.counts) ?? []), s]);
  // The count most subjects have is "every other module"; the rest are named.
  const rest = [...tally.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0]?.[0] ?? null;
  return {
    pooled: pooled.length ? { label: pooledYears.size === 1 && onlyYear ? `Year ${onlyYear}` : `${pooled.length} modules`, counts: rules.averageCounts } : null,
    special: [...tally.entries()].filter(([counts]) => counts !== rest).map(([counts, list]) => ({ names: list.map(nameOf), counts })),
    rest,
    total: totalMarks(rules),
  };
}

const marksWord = (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`;

/** 'A, B and C' */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The summary as one sentence. */
export function countsSentence(summary: CountsSummary): string {
  const parts: string[] = [];
  if (summary.pooled) parts.push(`${summary.pooled.label} counts as one average worth ${marksWord(summary.pooled.counts).replace('mark', 'classification mark')}`);
  for (const s of summary.special) parts.push(`${listed(s.names)} ${s.names.length === 1 ? 'counts' : 'count'} ${s.counts}${s.names.length === 1 ? '' : ' each'}`);
  if (summary.rest != null) parts.push(`${parts.length ? 'every other module' : 'every module'} counts ${summary.rest}`);
  const head = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : (parts[0] ?? '');
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}: ${summary.total} marks in all.`;
}
