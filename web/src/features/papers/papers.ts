// Your papers (IDEA-10): which modules a student sits. Picks are module ids: the Year 2 option, the Year 3 electives
// and papers from other years (a resit, say). Without picks, a year's papers are all its modules, as before.
import type { Me, ModuleSummary } from '../../api/types';
import type { CohortYear } from '../../state';

export type Zone = NonNullable<Me['zone']>;

/** Every zone the library knows (its Zone type), as the picker names it. */
export const ZONE_LABELS: Record<Zone, string> = { A: 'Zone A', B: 'Zone B', RTC: 'RTC' };

export interface PaperChoice {
  /** 'Your option' */
  label: string;
  /** how many of `ids` a student takes */
  pick: number;
  ids: readonly string[];
}

/** The choices inside a year. A choice may have no module on the Hub ('abstract-maths'). */
export const CHOICES: Partial<Record<CohortYear, PaperChoice>> = {
  2: { label: 'Your option', pick: 1, ids: ['econometrics', 'information-systems', 'abstract-maths'] },
  3: { label: 'Your electives', pick: 2, ids: ['microeconomics', 'asset-pricing', 'marketing-management', 'further-maths-economists'] },
};

/** Choices the Hub has no module page for, by id. */
export const NOT_ON_HUB: Readonly<Record<string, string>> = { 'abstract-maths': 'Abstract Mathematics' };

/** Picks as stored in a browser, or anything else: only well-formed ids, once each, at most 20. */
export function cleanPicks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((x): x is string => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x));
  return [...new Set(ids)].slice(0, 20);
}

/**
 * The module ids a student sits while looking at `year`, or null when that is every module of the year (no pick
 * changes it). Picks from other years count only in the student's own year (`home`).
 */
export function papersFor(
  year: CohortYear | null,
  home: CohortYear | null,
  picks: readonly string[],
  catalogue: readonly ModuleSummary[],
): Set<string> | null {
  if (!year || !picks.length) return null;
  const picked = new Set(picks);
  const choice = CHOICES[year];
  const chose = !!choice && choice.ids.some((id) => picked.has(id));
  const others = year === home ? catalogue.filter((m) => m.year !== year && picked.has(m.id)) : [];
  if (!chose && !others.length) return null;
  const own = catalogue.filter((m) => m.year === year && (!chose || !choice.ids.includes(m.id) || picked.has(m.id)));
  return new Set([...own, ...others].map((m) => m.id));
}

/** A module's events count for a student when it's one of their papers; other events follow their year. */
export function isMine(e: { moduleId: string | null; year: number | null }, year: number | null, papers: ReadonlySet<string> | null): boolean {
  if (papers && e.moduleId) return papers.has(e.moduleId);
  return year == null || e.year == null || e.year === year;
}

/** Your year's modules (after your choices), then the other years' papers you sit, in catalogue order. */
export function modulesFor(year: CohortYear, papers: ReadonlySet<string> | null, catalogue: readonly ModuleSummary[]): ModuleSummary[] {
  if (!papers) return catalogue.filter((m) => m.year === year);
  return [...catalogue.filter((m) => m.year === year && papers.has(m.id)), ...catalogue.filter((m) => m.year !== year && papers.has(m.id))];
}

/** Toggle a pick, keeping a choice to its size: picking one more than allowed drops the earliest. */
export function togglePick(picks: readonly string[], id: string, choice?: PaperChoice): string[] {
  if (picks.includes(id)) return picks.filter((p) => p !== id);
  const next = [...picks, id];
  if (!choice?.ids.includes(id)) return next;
  const mine = next.filter((p) => choice.ids.includes(p));
  const drop = new Set(mine.slice(0, Math.max(0, mine.length - choice.pick)));
  return next.filter((p) => !drop.has(p));
}

/** What a button says about someone's papers: 'Every Year 2 module', '5 papers'. */
export function picksSummary(year: CohortYear | null, papers: ReadonlySet<string> | null): string {
  if (!year || !papers) return year ? `Every Year ${year} module` : 'Not set';
  const n = papers.size;
  return `${n} ${n === 1 ? 'paper' : 'papers'}`;
}
