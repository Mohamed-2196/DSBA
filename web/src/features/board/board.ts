// The boards' rules, kept out of the components so they can be tested: templates and colours, moves, due dates and
// times, checklists, filters, the agenda's sections, revision plans and past papers.
import type {
  AgendaCard,
  BoardCard,
  BoardCardUpdate,
  BoardColumn,
  BoardPlan,
  BoardSummary,
  ChecklistItem,
} from '../../api/types';
import { formatSize } from '../../api/uploads';
import { addDaysToKey, daysBetween, type DayKey } from '../../lib/dates';

export type BoardColor = BoardSummary['color'];
export type BoardTemplate = BoardSummary['template'];
export type Priority = BoardCard['priority'];
export type RemindBefore = NonNullable<BoardCard['remindBefore']>;

// ── templates and looks ────────────────────────────────────────────────────────────────────

export interface TemplateInfo {
  id: BoardTemplate;
  name: string;
  /** what it's for, in a few words */
  blurb: string;
  /** its columns, as the API makes them; the last one counts as done */
  columns: readonly string[];
  /** a name for a board made from it */
  suggested: string;
  /** the colour a board made from it starts with */
  color: BoardColor;
}

/** The templates a student starts a board from. The API's "revision" template is left out: it is three renamed
 *  Study columns, and its name promises the revision plan that "Plan my revision" on a module makes. */
export const TEMPLATES: readonly TemplateInfo[] = [
  {
    id: 'study',
    name: 'Study',
    blurb: 'What to study, what you’re on and what’s done.',
    columns: ['To do', 'In progress', 'Done'],
    suggested: 'Study',
    color: 'cobalt',
  },
  {
    id: 'assignment',
    name: 'Assignment',
    blurb: 'Coursework from research to hand-in.',
    columns: ['Research', 'Draft', 'Review', 'Submitted'],
    suggested: 'Coursework',
    color: 'coral',
  },
  {
    id: 'weekly',
    name: 'Weekly planner',
    blurb: 'A column for each day of the week.',
    columns: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Done'],
    suggested: 'This week',
    color: 'teal',
  },
  {
    id: 'personal',
    name: 'Personal',
    blurb: 'Errands and everything outside study.',
    columns: ['Today', 'This week', 'Later', 'Done'],
    suggested: 'Personal',
    color: 'green',
  },
  {
    id: 'blank',
    name: 'Blank',
    blurb: 'Two columns to make your own.',
    columns: ['To do', 'Done'],
    suggested: 'My board',
    color: 'slate',
  },
];

/** The template's own name, or "Study 2", "Study 3"… when a board already has it (case aside). */
export function startName(suggested: string, taken: readonly string[]): string {
  const names = new Set(taken.map((n) => n.trim().toLowerCase()));
  if (!names.has(suggested.toLowerCase())) return suggested;
  for (let i = 2; ; i += 1) {
    const name = `${suggested} ${i}`;
    if (!names.has(name.toLowerCase())) return name;
  }
}

export const COLORS: readonly { id: BoardColor; label: string }[] = [
  { id: 'cobalt', label: 'Blue' },
  { id: 'teal', label: 'Teal' },
  { id: 'green', label: 'Green' },
  { id: 'amber', label: 'Amber' },
  { id: 'coral', label: 'Coral' },
  { id: 'slate', label: 'Grey' },
];

/** The design token a board or label colour fills a dot or a bar with. */
export function colorVar(color: BoardColor): string {
  const tokens: Record<BoardColor, string> = {
    cobalt: 'var(--cobalt)',
    teal: 'var(--y1)',
    green: 'var(--signal)',
    amber: 'var(--y3)',
    coral: 'var(--alert)',
    slate: 'var(--ink-3)',
  };
  return tokens[color] ?? 'var(--cobalt)';
}

/** The same colour for small text: each one reads at AA on a surface, in both themes. */
export function colorInk(color: BoardColor): string {
  const tokens: Record<BoardColor, string> = {
    cobalt: 'var(--cobalt)',
    teal: 'var(--y1-strong)',
    green: 'var(--signal-strong)',
    amber: 'var(--y3-strong)',
    coral: 'var(--alert-strong)',
    slate: 'var(--ink-2)',
  };
  return tokens[color] ?? 'var(--cobalt)';
}

/** Icons a student may give a board (optional: a board's colour already tells boards apart). */
export const EMOJI_CHOICES = ['📚', '🎯', '✍️', '🗓️', '🏠', '📌', '💼', '🧪', '📊', '💡', '🏃', '🛒'] as const;

export const PRIORITIES: readonly { id: Priority; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

export const REMINDERS: readonly { id: RemindBefore; label: string }[] = [
  { id: 0, label: 'At the time it’s due' },
  { id: 15, label: '15 minutes before' },
  { id: 60, label: '1 hour before' },
  { id: 1440, label: '1 day before' },
  { id: 2880, label: '2 days before' },
];

// ── columns and moves ──────────────────────────────────────────────────────────────────────

/** Done cards older than this fold into "Show N older". */
export const FOLD_AFTER_DAYS = 14;

/** One column's cards, in order (the board keeps each column's cards in order). */
export const cardsIn = (cards: readonly BoardCard[], columnId: string): BoardCard[] =>
  cards.filter((c) => c.columnId === columnId);

/** The cards column by column, as the API sends them; cards of a column that's gone go last. */
export function inColumnOrder(cards: readonly BoardCard[], columns: readonly BoardColumn[]): BoardCard[] {
  const known = new Set(columns.map((c) => c.id));
  return [...columns.flatMap((col) => cardsIn(cards, col.id)), ...cards.filter((c) => !known.has(c.columnId))];
}

/** Puts a card in `columnId` right after `afterId` (null: the top), as the API does. A card that lands in a done
 *  column is done now; one that leaves it isn't. */
export function placeCard(
  cards: readonly BoardCard[],
  columns: readonly BoardColumn[],
  id: string,
  columnId: string,
  afterId: string | null,
  now: string,
): BoardCard[] {
  const card = cards.find((c) => c.id === id);
  const target = columns.find((c) => c.id === columnId);
  if (!card || !target) return [...cards];
  const moved: BoardCard = { ...card, columnId, doneAt: target.done ? (card.doneAt ?? now) : null };
  const rest = cards.filter((c) => c.id !== id);
  const there = cardsIn(rest, columnId);
  const index = afterId ? there.findIndex((c) => c.id === afterId) + 1 : 0;
  const columnCards = [...there.slice(0, index), moved, ...there.slice(index)];
  return inColumnOrder([...rest.filter((c) => c.columnId !== columnId), ...columnCards], columns);
}

/** The list with `id` moved to right after `afterId` (null: first), as the API places boards and columns. */
export function placeAfter<T extends { id: string }>(list: readonly T[], id: string, afterId: string | null): T[] {
  const item = list.find((x) => x.id === id);
  if (!item || afterId === id) return [...list];
  const rest = list.filter((x) => x.id !== id);
  const at = afterId === null ? 0 : rest.findIndex((x) => x.id === afterId) + 1;
  if (at === 0 && afterId !== null) return [...list];
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

/** A new card at the end of its column. */
export const appendCard = (
  cards: readonly BoardCard[],
  columns: readonly BoardColumn[],
  card: BoardCard,
): BoardCard[] => inColumnOrder([...cards, card], columns);

/** The card to go after when `id` is dropped right before `beforeId` in `columnId`. */
export function afterIdBefore(
  cards: readonly BoardCard[],
  id: string,
  columnId: string,
  beforeId: string,
): string | null {
  const there = cardsIn(cards, columnId).filter((c) => c.id !== id);
  const i = there.findIndex((c) => c.id === beforeId);
  return i > 0 ? (there[i - 1]?.id ?? null) : null;
}

/** The last card of a column, leaving out `id`: where a card dropped on the column's free space goes after. */
export function lastIn(cards: readonly BoardCard[], columnId: string, id: string | null): string | null {
  return (
    cardsIn(cards, columnId)
      .filter((c) => c.id !== id)
      .at(-1)?.id ?? null
  );
}

/** Where "Move up" and "Move down" put a card: the afterId for the move, or undefined when it can't go that way. */
export function nudge(cards: readonly BoardCard[], id: string, by: -1 | 1): string | null | undefined {
  const card = cards.find((c) => c.id === id);
  if (!card) return undefined;
  const there = cardsIn(cards, card.columnId);
  const to = there.findIndex((c) => c.id === id) + by;
  if (to < 0 || to >= there.length) return undefined;
  const others = there.filter((c) => c.id !== id);
  return to === 0 ? null : (others[to - 1]?.id ?? null);
}

/** The column before or after the card's, for Alt+Left and Alt+Right, or null at either end. */
export function neighbourColumn(columns: readonly BoardColumn[], columnId: string, by: -1 | 1): BoardColumn | null {
  const i = columns.findIndex((c) => c.id === columnId);
  return i < 0 ? null : (columns[i + by] ?? null);
}

/** A column's name in a list of columns to pick from: "Waiting (done)" when its cards count as done and its name
 *  doesn't say so. */
export const columnLabel = (column: Pick<BoardColumn, 'name' | 'done'>): string =>
  column.done && !/\bdone\b/i.test(column.name) ? `${column.name} (done)` : column.name;

/** The first column marked done, where "Mark done" sends a card. */
export const doneColumn = (columns: readonly BoardColumn[]): BoardColumn | null => columns.find((c) => c.done) ?? null;

export function counts(cards: readonly BoardCard[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) out[c.columnId] = (out[c.columnId] ?? 0) + 1;
  return out;
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

// ── due dates, times, checklists ───────────────────────────────────────────────────────────

/** The day a card is due: its own due date, else the day its revision plan gives it, else its event's last day. */
export const dueOf = (card: Pick<BoardCard, 'dueDate' | 'planDate' | 'link'>): DayKey | null =>
  card.dueDate ?? card.planDate ?? card.link?.date ?? null;

/** Past its due day and not done. */
export function isOverdue(card: Pick<BoardCard, 'dueDate' | 'planDate' | 'link' | 'doneAt'>, today: DayKey): boolean {
  const due = dueOf(card);
  return card.doneAt == null && due != null && due < today;
}

/** '14:30:00' -> '14:30'. */
export const timeText = (time: string | null | undefined): string => (time ? time.slice(0, 5) : '');

/** "Due today", "Due tomorrow", "Due in 3 days", "Overdue by 2 days", or the date further out; with the time. */
export function dueLabel(due: DayKey, today: DayKey, formatted: string, time?: string | null): string {
  const days = daysBetween(today, due);
  const at = time ? ` at ${timeText(time)}` : '';
  if (days === 0) return `Due today${at}`;
  if (days === 1) return `Due tomorrow${at}`;
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`;
  if (days <= 7) return `Due in ${days} days`;
  return `Due ${formatted}${at}`;
}

export function checklistProgress(items: readonly ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** A fresh id for a to-do (letters and digits, as the API accepts). */
export function newItemId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Moves the to-do `id` one place up or down. */
export function moveItem(items: readonly ChecklistItem[], id: string, by: -1 | 1): ChecklistItem[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= items.length) return [...items];
  const out = [...items];
  [out[i], out[j]] = [out[j] as ChecklistItem, out[i] as ChecklistItem];
  return out;
}

// ── what a card says, and changes to it ────────────────────────────────────────────────────

/** A description (Markdown) as one line of plain text, for the preview on a card: marks, link addresses, list
 *  bullets and headings' hashes go; words stay, snake_case included. */
export function plainText(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return markdown
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d{1,3}[.)][ \t]+)/gm, '')
    .replace(/(\*\*|__|~~)(?=\S)([^\n]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])[*_](?=\S)([^*_\n]*?\S)[*_](?![\w*])/g, '$1$2')
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The card as the API will send it back after `patch` (fields not sent stay; null clears; clearing the due date
 *  clears the time). For showing a change at once, before the answer comes. */
export function patchCard<T extends BoardCard>(card: T, patch: BoardCardUpdate): T {
  const next: T = { ...card };
  if (patch.title != null) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description || null;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.dueTime !== undefined) next.dueTime = patch.dueTime;
  if (next.dueDate == null) next.dueTime = null;
  if (patch.remindBefore !== undefined) next.remindBefore = patch.remindBefore;
  if (patch.priority != null) next.priority = patch.priority;
  if (patch.labelIds != null) next.labelIds = patch.labelIds;
  if (patch.checklist != null) next.checklist = patch.checklist;
  if (patch.coverId !== undefined) next.coverUrl = patch.coverId ? `/api/v1/board-files/${patch.coverId}` : null;
  return next;
}

// ── filters and the agenda ─────────────────────────────────────────────────────────────────

export type DueFilter = 'any' | 'overdue' | 'today' | 'week' | 'none';

export const DUE_FILTERS: readonly { id: DueFilter; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'week', label: 'Due this week' },
  { id: 'none', label: 'No due date' },
];

export interface CardFilter {
  labels: readonly string[];
  due: DueFilter;
}

export const NO_FILTER: CardFilter = { labels: [], due: 'any' };

export const isFiltering = (f: CardFilter): boolean => f.labels.length > 0 || f.due !== 'any';

/** Does the card pass the filter? Every chosen label must be on it; the due filter looks at cards not done. */
export function matches(card: BoardCard, f: CardFilter, today: DayKey): boolean {
  if (f.labels.some((l) => !card.labelIds.includes(l))) return false;
  if (f.due === 'any') return true;
  const due = dueOf(card);
  if (f.due === 'none') return due == null;
  if (due == null || card.doneAt != null) return false;
  if (f.due === 'overdue') return due < today;
  if (f.due === 'today') return due === today;
  return due >= today && due <= addDaysToKey(today, 7);
}

export interface AgendaSection {
  id: 'overdue' | 'today' | 'tomorrow' | 'week';
  title: string;
  cards: AgendaCard[];
}

/** The agenda in sections: Overdue, Today, Tomorrow, Next 7 days (empty ones left out). */
export function agendaSections(cards: readonly AgendaCard[], today: DayKey): AgendaSection[] {
  const tomorrow = addDaysToKey(today, 1);
  const sections: AgendaSection[] = [
    { id: 'overdue', title: 'Overdue', cards: cards.filter((c) => c.due < today) },
    { id: 'today', title: 'Today', cards: cards.filter((c) => c.due === today) },
    { id: 'tomorrow', title: 'Tomorrow', cards: cards.filter((c) => c.due === tomorrow) },
    { id: 'week', title: 'Next 7 days', cards: cards.filter((c) => c.due > tomorrow) },
  ];
  return sections.filter((s) => s.cards.length > 0);
}

// ── revision plans and past papers ─────────────────────────────────────────────────────────

/** A past paper from the library. */
export const isPastPaper = (card: Pick<BoardCard, 'link'>): boolean =>
  card.link?.type === 'library_item' && card.link.kind === 'past-paper';

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
 *  zone A, zone B and RTC are papers of one sitting. Papers without a year count as one sitting each. */
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

/** "3.4 MB of 200 MB". */
export function storageText(used: number, max: number): string {
  return `${formatSize(used)} of ${formatSize(max)}`;
}
