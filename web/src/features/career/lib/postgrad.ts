// Postgraduate courses and scholarships as a search, like the vacancies (board.ts): narrowed by a text search and two
// filter groups (kind and region), counted per option and sorted, the soonest to close first if asked. Pure, so the
// rules are unit-tested (postgrad.test.ts); the URL holds the state.
import type { FurtherStudyOption } from '../../../api/types';
import { daysBetween, type DayKey } from '../../../lib/dates';
import { fold } from './board';

export type StudyFacet = 'kind' | 'region';
export type StudySort = 'suggested' | 'name' | 'closing';

export interface StudyFilters {
  q: string;
  kind: string[]; // 'course', 'scholarship'
  region: string[];
}

export const STUDY_FACETS: readonly StudyFacet[] = ['kind', 'region'];
export const STUDY_KINDS = ['course', 'scholarship'] as const;

export const isStudyFacet = (v: string): v is StudyFacet => (STUDY_FACETS as readonly string[]).includes(v);

export const parseStudySort = (raw: string | null): StudySort =>
  raw === 'name' || raw === 'closing' ? raw : 'suggested';

/** The regions on the list, most options first, then A to Z. */
export function regionsOf(options: readonly FurtherStudyOption[]): string[] {
  const counts = new Map<string, number>();
  for (const o of options) if (o.region) counts.set(o.region, (counts.get(o.region) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([r]) => r);
}

function matchesText(o: FurtherStudyOption, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([o.name, o.note, o.region ?? '', o.when ?? ''].join(' '));
  return words.every((w) => hay.includes(w));
}

function matchesFacet(o: FurtherStudyOption, facet: StudyFacet, picked: readonly string[]): boolean {
  if (!picked.length) return true;
  return facet === 'kind' ? picked.includes(o.kind) : !!o.region && picked.includes(o.region);
}

function matches(o: FurtherStudyOption, f: StudyFilters, skip?: StudyFacet): boolean {
  return matchesText(o, f.q) && STUDY_FACETS.every((facet) => facet === skip || matchesFacet(o, facet, f[facet]));
}

export const filterStudy = (options: readonly FurtherStudyOption[], f: StudyFilters): FurtherStudyOption[] =>
  options.filter((o) => matches(o, f));

/** How many options each choice of a group would show, given the search and the other group. */
export function studyCounts(
  options: readonly FurtherStudyOption[],
  f: StudyFilters,
  facet: StudyFacet,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of options) {
    if (!matches(o, f, facet)) continue;
    const v = facet === 'kind' ? o.kind : o.region;
    if (v) counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

export const studyFiltered = (f: StudyFilters): boolean =>
  f.q.trim() !== '' || STUDY_FACETS.some((facet) => f[facet].length);

/**
 * 'suggested' keeps the editors' order; 'closing' puts the options still open first, the soonest to close first, then
 * those already closed or with no closing day, in the editors' order.
 */
export function sortStudy(
  options: readonly FurtherStudyOption[],
  sort: StudySort,
  today: DayKey,
): FurtherStudyOption[] {
  if (sort === 'name') return [...options].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  if (sort === 'closing') {
    const rank = (o: FurtherStudyOption) => (o.closes && o.closes >= today ? o.closes : '￿');
    return [...options].sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
  }
  return [...options];
}

/** '19 days to apply', 'Last day to apply', 'Closed', or null with no closing day. */
export function daysToApply(closes: string | null | undefined, today: DayKey): string | null {
  if (!closes) return null;
  const n = daysBetween(today, closes as DayKey);
  if (n < 0) return 'Closed';
  if (n === 0) return 'Last day to apply';
  return n === 1 ? '1 day to apply' : `${n} days to apply`;
}
