// The library's filters as a phone shows them: what is set, each as a removable chip, how many, and the sort a view
// opens with. Pure, so it is tested (filters.test.ts); LibraryPage reads and writes them in the URL.
import { EXAM_KINDS, KIND_BY_ID, type ItemSource, type LibraryKind } from './kinds';
import type { CohortYear, LibrarySort, LibraryView } from './types';

/** URL changes: a null value takes the parameter out. */
export type Patch = Record<string, string | null | undefined>;

export interface FilterState {
  /** the year browsed (null: every year) and the one the page opens with */
  year: CohortYear | null;
  defaultYear: CohortYear | null;
  /** the module's tag ('ST2133'), when one is chosen */
  module: string | null;
  kind: LibraryKind | null;
  starred: boolean;
  mine: boolean;
  source: ItemSource | null;
}

export interface ActiveFilter {
  id: 'year' | 'module' | 'type' | 'starred' | 'mine' | 'source';
  label: string;
  /** what removing it changes in the URL */
  patch: Patch;
}

/** The filters that are set, in the sheet's order. A year counts only when it isn't the one the page opens with, and
 *  not beside a module, which sets its own year. */
export function activeFilters(f: FilterState): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (f.year !== f.defaultYear && !f.module)
    out.push({ id: 'year', label: f.year ? `Year ${f.year}` : 'All years', patch: { year: null } });
  if (f.module) out.push({ id: 'module', label: f.module, patch: { module: null } });
  if (f.kind) out.push({ id: 'type', label: KIND_BY_ID[f.kind].plural, patch: { type: null } });
  if (f.starred) out.push({ id: 'starred', label: 'Starred', patch: { starred: null } });
  if (f.mine) out.push({ id: 'mine', label: 'Your uploads', patch: { mine: null } });
  if (f.source)
    out.push({ id: 'source', label: f.source === 'file' ? 'Files only' : 'Links only', patch: { source: null } });
  return out;
}

/** Everything activeFilters() can set, back to how the page opens (the search stays). */
export const CLEAR_ALL: Patch = { year: null, module: null, type: null, starred: null, mine: null, source: null };

/**
 * The order a list opens with: best match for a search, the newest sitting for past papers, examiners' reports and
 * solutions, and the most downloaded otherwise ("New this week" already shows what's recent).
 */
export function defaultSort(searching: boolean, kind: LibraryKind | null): LibrarySort {
  if (searching) return 'relevance';
  return kind && EXAM_KINDS.has(kind) ? 'sitting' : 'popular';
}

/** The sort in the URL, or the default. Best match needs a search; Newest sitting needs a module or exam files. */
export function readSort(
  raw: string | null,
  { searching, kind, module }: { searching: boolean; kind: LibraryKind | null; module: boolean },
): LibrarySort {
  const fallback = defaultSort(searching, kind);
  if (raw === 'relevance') return searching ? 'relevance' : fallback;
  if (raw === 'sitting') return sittingSortOffered(kind, module) ? 'sitting' : fallback;
  if (raw === 'new' || raw === 'popular' || raw === 'title') return raw;
  return fallback;
}

/** Newest sitting is offered for one module's files, or for past papers, reports and solutions. */
export function sittingSortOffered(kind: LibraryKind | null, module: boolean): boolean {
  return module || (!!kind && EXAM_KINDS.has(kind));
}

/** The view a list opens with: index cards, whose drawn documents say what each file is (the covers of exam papers
 *  look alike). Covers are a choice away. */
export const DEFAULT_VIEW: LibraryView = 'list';
