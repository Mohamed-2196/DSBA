// Your modules: which modules a student sits, and their exam zone. Picks are module ids: the Year 2 option, the
// Year 3 electives and modules from other years (a resit, say). Without picks, a year's modules are all of them.
import type { ModuleSummary, PaperChoice } from '../../api/types';
import { cohortLabel, type CohortYear } from '../../state';

/** A choice inside a year, as the form offers it. */
export interface Choice {
  kind: PaperChoice['kind'];
  /** 'Your option' or 'Your electives' */
  label: string;
  /** how many of `ids` a student takes */
  pick: number;
  /** what picks hold for each option: its module's id, or its own without a module ('abstract-maths') */
  ids: readonly string[];
  /** the options the Hub has no module page for, by id: 'Abstract Mathematics' */
  notOnHub: Readonly<Record<string, string>>;
}

export type Choices = Partial<Record<CohortYear, Choice>>;

/** The choices inside each year, from the grades calculator's rules (GET /modules/choices). */
export function choicesFrom(served: readonly PaperChoice[] | undefined): Choices {
  const out: Choices = {};
  for (const c of served ?? []) {
    const notOnHub: Record<string, string> = {};
    for (const o of c.options) if (!o.moduleId) notOnHub[o.id] = o.label ?? o.id;
    out[c.year] = {
      kind: c.kind,
      label: c.kind === 'option' ? 'Your option' : 'Your electives',
      pick: c.pick,
      ids: c.options.map((o) => o.moduleId ?? o.id),
      notOnHub,
    };
  }
  return out;
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
  choices: Choices,
): Set<string> | null {
  if (!year || !picks.length) return null;
  const picked = new Set(picks);
  const choice = choices[year];
  const chose = !!choice && choice.ids.some((id) => picked.has(id));
  const others = year === home ? catalogue.filter((m) => m.year !== year && picked.has(m.id)) : [];
  if (!chose && !others.length) return null;
  const own = catalogue.filter((m) => m.year === year && (!chose || !choice.ids.includes(m.id) || picked.has(m.id)));
  return new Set([...own, ...others].map((m) => m.id));
}

/** No modules being resat. */
export const NO_RESITS: ReadonlySet<string> = new Set();

/**
 * Whether a resit is for a student of `year` (null: any year) resitting the modules in `resits`: the year after the
 * module's, and anyone resitting it. A final-year module's resit is only for those resitting it. The API's
 * calendar.resit_for.
 */
export function resitFor(
  e: { moduleId: string | null; year: number | null },
  year: number | null,
  resits: ReadonlySet<string> = NO_RESITS,
): boolean {
  if (e.moduleId && resits.has(e.moduleId)) return true;
  return year == null || e.year == null || year === e.year + 1;
}

/**
 * Whether a calendar event counts for a student: a module's main sitting and other dates when it's one of their
 * papers, other dates by their year, and the resits for them (resitFor). A module's own year never has its resit.
 * The API's my_calendar.counts_for.
 */
export function isMine(
  e: { moduleId: string | null; year: number | null; resit?: boolean },
  year: number | null,
  papers: ReadonlySet<string> | null,
  resits: ReadonlySet<string> = NO_RESITS,
): boolean {
  if (e.resit) return resitFor(e, year, resits);
  if (papers && e.moduleId) return papers.has(e.moduleId);
  return year == null || e.year == null || e.year === year;
}

/** Your year's modules (after your choices), then the other years' papers you sit, in catalogue order. */
export function modulesFor(
  year: CohortYear,
  papers: ReadonlySet<string> | null,
  catalogue: readonly ModuleSummary[],
): ModuleSummary[] {
  if (!papers) return catalogue.filter((m) => m.year === year);
  return [
    ...catalogue.filter((m) => m.year === year && papers.has(m.id)),
    ...catalogue.filter((m) => m.year !== year && papers.has(m.id)),
  ];
}

/** The one module of a pick-one choice (the Year 2 option), or none: every other module of the choice is dropped. */
export function pickOnly(picks: readonly string[], id: string | null, choice: Choice): string[] {
  const rest = picks.filter((p) => !choice.ids.includes(p));
  return id ? [...rest, id] : rest;
}

/** Toggle a pick, keeping a choice to its size: picking one more than allowed drops the earliest. */
export function togglePick(picks: readonly string[], id: string, choice?: Choice): string[] {
  if (picks.includes(id)) return picks.filter((p) => p !== id);
  const next = [...picks, id];
  if (!choice?.ids.includes(id)) return next;
  const mine = next.filter((p) => choice.ids.includes(p));
  const drop = new Set(mine.slice(0, Math.max(0, mine.length - choice.pick)));
  return next.filter((p) => !drop.has(p));
}

/**
 * What Home says under a student's modules, and what its button does: their option or electives still to pick, or
 * which modules the list shows. Null without a year of their own.
 */
export function papersNote(
  home: CohortYear | null,
  picks: readonly string[],
  papers: ReadonlySet<string> | null,
  choices: Choices,
): { text: string; action: string } | null {
  if (!home) return null;
  const choice = choices[home];
  if (choice && !choice.ids.some((id) => picks.includes(id))) {
    const what = choice.kind === 'option' ? 'option' : 'electives';
    return {
      text: `Pick your ${cohortLabel(home)} ${what} to list only the modules you sit.`,
      action: `Pick your ${what}`,
    };
  }
  if (!papers) return { text: `Every ${cohortLabel(home)} module.`, action: 'Change' };
  return { text: `The ${papers.size} ${papers.size === 1 ? 'module' : 'modules'} you sit.`, action: 'Change' };
}

/** What the button says: 'Year 2, option not picked', '5 modules', 'every Year 1 module', 'not set'. */
export function picksSummary(
  home: CohortYear | null,
  picks: readonly string[],
  papers: ReadonlySet<string> | null,
  choices: Choices,
): string {
  if (!home) return 'not set';
  const choice = choices[home];
  if (choice && !choice.ids.some((id) => picks.includes(id)))
    return `${cohortLabel(home)}, ${choice.kind === 'option' ? 'option' : 'electives'} not picked`;
  if (!papers) return `every ${cohortLabel(home)} module`;
  return `${papers.size} ${papers.size === 1 ? 'module' : 'modules'}`;
}
