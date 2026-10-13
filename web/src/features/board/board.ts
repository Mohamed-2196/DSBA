// The study board's rules, kept out of the components so they can be tested: column order, moves, due dates and
// the folded part of Done.
import type { BoardCard } from '../../api/types';
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

export const isColumn = (value: unknown): value is Column => COLUMNS.some((c) => c.id === value);

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

/** The day a card is due: its own due date, else its event's last day. */
export const dueOf = (card: BoardCard): DayKey | null => card.dueDate ?? card.link?.date ?? null;

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
