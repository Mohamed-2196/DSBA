// "Pick up where you left off": the last papers, files, notes and lessons opened, kept in this browser only (nothing
// goes to the server, so it isn't tracking and needs no opt-in), one list per account. Pure, so it is unit-tested;
// useRecent.ts is its React face.

export type VisitKind = 'paper' | 'file' | 'note' | 'lesson';

export interface Visit {
  kind: VisitKind;
  /** the thing's id (a library item's, a note's, a lesson's) */
  id: string;
  /** where it opens in the Hub */
  path: string;
  /** what lists call it: 'ST2134 · May 2025 · Zone A', a note's title, a lesson's name */
  title: string;
  /** the module it belongs to, when it has one */
  moduleId: string | null;
  /** a note written on a library file: that file's id */
  onItem: string | null;
  /** when it was last opened (ms) */
  at: number;
}

/** How many are kept. */
export const MAX_VISITS = 8;

/** Personal: every 'hub.mine.' key goes on sign-out (auth/queries.ts). One list per account, and one for a guest. */
export const recentKey = (account: string | null): string => `hub.mine.recent.${account ?? 'guest'}`;

const KINDS: readonly VisitKind[] = ['paper', 'file', 'note', 'lesson'];
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const orNull = (v: unknown): string | null => (text(v, 200) ? v : null);

function cleanVisit(raw: unknown): Visit | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!KINDS.includes(r.kind as VisitKind)) return null;
  if (!text(r.id, 200) || !text(r.title, 300) || !text(r.path, 500) || !r.path.startsWith('/')) return null;
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null;
  return {
    kind: r.kind as VisitKind,
    id: r.id,
    path: r.path,
    title: r.title,
    moduleId: orNull(r.moduleId),
    onItem: orNull(r.onItem),
    at: r.at,
  };
}

/** The stored list, newest first: what can't be read is left out. */
export function cleanVisits(raw: unknown): Visit[] {
  if (!Array.isArray(raw)) return [];
  const out: Visit[] = [];
  for (const v of raw) {
    const ok = cleanVisit(v);
    if (ok && !out.some((o) => sameThing(o, ok))) out.push(ok);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_VISITS);
}

const sameThing = (a: Pick<Visit, 'kind' | 'id'>, b: Pick<Visit, 'kind' | 'id'>) =>
  (a.kind === 'note') === (b.kind === 'note') && (a.kind === 'lesson') === (b.kind === 'lesson') && a.id === b.id;

/** The list with `visit` first (once), at most MAX_VISITS long. */
export function withVisit(list: readonly Visit[], visit: Visit): Visit[] {
  return [visit, ...list.filter((v) => !sameThing(v, visit))].slice(0, MAX_VISITS);
}

/** The list without one thing (it was deleted, or the student cleared it). */
export const withoutVisit = (list: readonly Visit[], gone: Pick<Visit, 'kind' | 'id'>): Visit[] =>
  list.filter((v) => !sameThing(v, gone));

/** The same visit, telling whether a new one changes anything worth storing (not just the time). */
export const sameVisit = (a: Visit | undefined, b: Visit): boolean =>
  !!a &&
  sameThing(a, b) &&
  a.title === b.title &&
  a.path === b.path &&
  a.moduleId === b.moduleId &&
  a.onItem === b.onItem;

export interface CarryOnRow {
  visit: Visit;
  /** a paper's or file's note, opened since: shown with it rather than on a row of its own */
  note: Visit | null;
}

/**
 * The rows to show: newest first, each note written on a file shown with that file when the file is in the list
 * too, and the paper being timed left out (it has its own row). With `moduleId`, only that module's (a note on a
 * module's file counts as the module's).
 */
export function carryOnRows(
  list: readonly Visit[],
  {
    moduleId = null,
    timedId = null,
    n = MAX_VISITS,
  }: { moduleId?: string | null; timedId?: string | null; n?: number },
): CarryOnRow[] {
  const files = new Map(list.filter((v) => v.kind === 'paper' || v.kind === 'file').map((v) => [v.id, v]));
  const notes = new Map<string, Visit>();
  for (const v of list) if (v.kind === 'note' && v.onItem && !notes.has(v.onItem)) notes.set(v.onItem, v);
  const moduleOf = (v: Visit) => v.moduleId ?? (v.onItem ? (files.get(v.onItem)?.moduleId ?? null) : null);
  const rows: CarryOnRow[] = [];
  for (const v of list) {
    if (moduleId && moduleOf(v) !== moduleId) continue;
    if (v.kind !== 'note' && v.id === timedId) continue;
    if (v.kind === 'note' && v.onItem && (files.has(v.onItem) || v.onItem === timedId)) continue; // with its file
    rows.push({ visit: v, note: v.kind !== 'note' && v.kind !== 'lesson' ? (notes.get(v.id) ?? null) : null });
  }
  return rows.slice(0, n);
}

/** The note written on a file, when one was opened. */
export const noteOn = (list: readonly Visit[], itemId: string): Visit | null =>
  list.find((v) => v.kind === 'note' && v.onItem === itemId) ?? null;
