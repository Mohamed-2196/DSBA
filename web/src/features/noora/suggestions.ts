// What Mini Noora offers to answer when her panel opens: three or four questions about the page the student is on,
// from her script (GET /mini-noora/script, edited in Manage → Mini Noora) and the module catalogue that is already
// loaded. In a question, {module} is the module of the page, or else the first module of the student's year, and
// {module2} the second, each by its unit code. A question is left out while the feature it needs is off, or when it
// names a module the student has none of. The questions her script starts with are ones her brain answers well
// (suggestions.test.ts asks each one). Pure: no React, no network.
import { matchPath } from 'react-router-dom';
import type { ModuleSummary, NooraChip, NooraPageChips } from '../../api/types';
import type { Feature } from '../../auth';

export type NooraPage = NooraPageChips['page'];

export interface PageContext {
  pathname: string;
  /** the year the student is browsing */
  year: number | null;
  /** the module catalogue */
  modules: readonly ModuleSummary[];
  isOn: (feature: Feature) => boolean;
  /** her questions for each page (her script's pageChips) */
  pages: readonly NooraPageChips[];
}

const MAX = 4;

/** The pages with questions of their own; the first that matches wins. Anywhere else is 'other'. */
const ROUTES: readonly { page: NooraPage; path: string }[] = [
  { page: 'home', path: '/' },
  { page: 'modules', path: '/modules' },
  { page: 'module', path: '/modules/:moduleId' },
  { page: 'library', path: '/library/*' },
  { page: 'calendar', path: '/calendar' },
  { page: 'forum', path: '/forum/*' },
  { page: 'notes', path: '/notes/*' },
  { page: 'grades', path: '/grades' },
];

/** The page a path is, for her questions, and the module it is about. */
export function pageOf(pathname: string): { page: NooraPage; moduleId: string | null } {
  for (const r of ROUTES) {
    const match = matchPath({ path: r.path, end: true }, pathname);
    if (match) return { page: r.page, moduleId: match.params.moduleId ?? null };
  }
  return { page: 'other', moduleId: null };
}

/** A module's short name in a question: its unit code ('ST2133'), or its name when it has none. */
const called = (m: ModuleSummary): string => m.unitCode ?? m.name;

/** The modules of the student's year (every module when no year is chosen), in catalogue order. */
const ofYear = (ctx: PageContext): ModuleSummary[] => ctx.modules.filter((m) => ctx.year == null || m.year === ctx.year);

/** A question as the student sees it, or null when it can't be asked here. */
export function chipText(chip: NooraChip, isOn: (feature: Feature) => boolean, module: ModuleSummary | undefined, module2: ModuleSummary | undefined): string | null {
  if (chip.needs && !isOn(chip.needs)) return null;
  if (chip.text.includes('{module}') && !module) return null;
  if (chip.text.includes('{module2}') && !module2) return null;
  return chip.text.replaceAll('{module2}', module2 ? called(module2) : '').replaceAll('{module}', module ? called(module) : '');
}

/** Three or four questions for the page at `ctx.pathname`. */
export function pageSuggestions(ctx: PageContext): string[] {
  const { page, moduleId } = pageOf(ctx.pathname);
  const [first, second] = ofYear(ctx);
  const chipsOf = (p: NooraPage) => ctx.pages.find((x) => x.page === p)?.chips ?? [];
  const onPage = page === 'module' ? ctx.modules.find((m) => m.id === moduleId) : first;
  let chips = unique(chipsOf(page).map((c) => chipText(c, ctx.isOn, onPage, second)));
  if (chips.length < 3 && page !== 'other') chips = unique([...chips, ...chipsOf('other').map((c) => chipText(c, ctx.isOn, first, second))]);
  return chips.slice(0, MAX);
}

function unique(list: (string | null)[]): string[] {
  return [...new Set(list.filter((s): s is string => typeof s === 'string' && s.length > 0))];
}
