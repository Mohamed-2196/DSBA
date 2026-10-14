// The study board's rules, kept out of the components so they can be tested: column order, moves, due dates, the
// folded part of Done, revision plans and past papers.
import type { BoardCard, BoardPlan } from '../../api/types';
import { daysBetween, type DayKey } from '../../lib/dates';

export type Column = BoardCard['column'];

export const COLUMNS: readonly { id: Column; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

export const columnLabel = (c: Column): string => COLUMNS.find((x) => x.id === c)?.label ?? c;

/** Done cards older than this fold into "Show N older". */
export const FOLD_AFTER_DAYS = 14;

/** One column's cards, in order (the board keeps each column's cards in order). */
export const cardsIn = (cards: readonly BoardCard[], column: Column): BoardCard[] => cards.filter((c) => c.column === column);

export function counts(cards: readonly BoardCard[]): Record<Column, number> {
  const out: Record<Column, number> = { todo: 0, doing: 0, done: 0 };
  for (const c of cards) out[c.column] += 1;
  return out;
}

/** Puts a card in `column` right after `afterId` (null: the top), as the API does. Other cards keep their order. */
export function placeCard(cards: readonly BoardCard[], id: string, column: Column, afterId: string | null, now: string): BoardCard[] {
  const card = cards.find((c) => c.id === id);
  if (!card) return [...cards];
  const moved: BoardCard = card.column === column ? card : { ...card, column, doneAt: column === 'done' ? now : null };
  const rest = cards.filter((c) => c.id !== id);
  const target = cardsIn(rest, column);
  const index = afterId ? target.findIndex((c) => c.id === afterId) + 1 : 0;
  const columnCards = [...target.slice(0, index), moved, ...target.slice(index)];
  return COLUMNS.flatMap(({ id: col }) => (col === column ? columnCards : cardsIn(rest, col)));
}

/** A new card at the end of its column. */
export function appendCard(cards: readonly BoardCard[], card: BoardCard): BoardCard[] {
  return COLUMNS.flatMap(({ id }) => (id === card.column ? [...cardsIn(cards, id), card] : cardsIn(cards, id)));
}

/** The card to go after when `id` lands at `index` of `column` (counted without the card itself). */
export function afterIdAt(cards: readonly BoardCard[], id: string, column: Column, index: number): string | null {
  const target = cardsIn(cards, column).filter((c) => c.id !== id);
  const i = Math.max(0, Math.min(index, target.length));
  return i === 0 ? null : (target[i - 1]?.id ?? null);
}

/** The card to go after when `id` is dropped right before `beforeId` in `column`. */
export function afterIdBefore(cards: readonly BoardCard[], id: string, column: Column, beforeId: string): string | null {
  const target = cardsIn(cards, column).filter((c) => c.id !== id);
  const i = target.findIndex((c) => c.id === beforeId);
  return i > 0 ? (target[i - 1]?.id ?? null) : null;
}

/** Where "Move up" and "Move down" put a card: the afterId for the move, or undefined when it can't go that way. */
export function nudge(cards: readonly BoardCard[], id: string, by: -1 | 1): string | null | undefined {
  const card = cards.find((c) => c.id === id);
  if (!card) return undefined;
  const column = cardsIn(cards, card.column);
  const i = column.findIndex((c) => c.id === id);
  const to = i + by;
  if (to < 0 || to >= column.length) return undefined;
  return afterIdAt(cards, id, card.column, to);
}

/** The day a card is due: its own due date, else the day its revision plan gives it, else its event's last day. */
export const dueOf = (card: BoardCard): DayKey | null => card.dueDate ?? card.planDate ?? card.link?.date ?? null;

/** Past its due day and not done. */
export function isOverdue(card: BoardCard, today: DayKey): boolean {
  const due = dueOf(card);
  return card.column !== 'done' && due != null && due < today;
}

/** Done cards finished in the last 14 days, and the older ones that fold away. */
export function splitDone(done: readonly BoardCard[], today: DayKey): { recent: BoardCard[]; older: BoardCard[] } {
  const recent: BoardCard[] = [];
  const older: BoardCard[] = [];
  for (const c of done) {
    const old = c.doneAt != null && daysBetween(c.doneAt.slice(0, 10), today) > FOLD_AFTER_DAYS;
    (old ? older : recent).push(c);
  }
  return { recent, older };
}

/** "Due today", "Due tomorrow", "Due in 3 days", "Overdue by 2 days", or the date further out. */
export function dueLabel(due: DayKey, today: DayKey, formatted: string): string {
  const days = daysBetween(today, due);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`;
  if (days <= 7) return `Due in ${days} days`;
  return `Due ${formatted}`;
}

/** A past paper from the library. */
export const isPastPaper = (card: BoardCard): boolean => card.link?.type === 'library_item' && card.link.kind === 'past-paper';

/** "About 4 a day", "1 every 3 days", or what to say once the exam day has come. */
export function planPace(plan: Pick<BoardPlan, 'left' | 'daysLeft'>): string {
  if (plan.left === 0) return 'All done.';
  if (plan.daysLeft <= 0) return 'The exam day has come.';
  const perDay = plan.left / plan.daysLeft;
  if (perDay >= 1) return `About ${Math.round(perDay)} a day`;
  const every = Math.round(plan.daysLeft / plan.left);
  return every <= 1 ? 'About 1 a day' : `1 every ${every} days`;
}

/** A sitting: a paper's exam year and session (May or October), as the library groups them (GET /library/papers);
 *  zone A and zone B are two papers of one sitting. Papers without a year count as one sitting each. */
export interface Paper {
  id: string;
  examYear?: number | null;
  examSession?: string | null;
}

const sittingOf = (p: Paper): string => (p.examYear ? `${p.examYear}-${p.examSession ?? ''}` : `item-${p.id}`);

/** How many of the papers' sittings have a paper done, out of how many sittings. */
export function sittingsDone(papers: readonly Paper[], done: ReadonlySet<string>): { done: number; total: number } {
  const all = new Set<string>();
  const finished = new Set<string>();
  for (const p of papers) {
    const s = sittingOf(p);
    all.add(s);
    if (done.has(p.id)) finished.add(s);
  }
  return { done: finished.size, total: all.size };
}

/** A practice score as typed: a whole or half percentage from 0 to 100, or null when left empty. */
export function parseScore(raw: string): number | null | undefined {
  const t = raw.trim().replace(/%$/, '').trim();
  if (!t) return null;
  if (!/^\d{1,3}(\.\d)?$/.test(t)) return undefined;
  const n = Number(t);
  return n <= 100 ? n : undefined;
}
