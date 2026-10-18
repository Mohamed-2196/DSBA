import { describe, expect, it } from 'vitest';
import type { AgendaCard, BoardCard, BoardColumn } from '../../api/types';
import {
  afterIdBefore,
  agendaSections,
  appendCard,
  checklistProgress,
  colorInk,
  COLORS,
  columnLabel,
  counts,
  dueLabel,
  dueOf,
  isOverdue,
  isPastPaper,
  isUnsaved,
  lastIn,
  matches,
  moveItem,
  neighbourColumn,
  nudge,
  parseScore,
  patchCard,
  placeAfter,
  placeCard,
  plainText,
  planPace,
  sittingsDone,
  splitDone,
  startName,
  storageText,
  TEMPLATES,
  withExistingLabels,
  type Paper,
} from './board';
import { scoresById, withScore } from './scores';

const card = (id: string, columnId: string, extra: Partial<BoardCard> = {}): BoardCard => ({
  id,
  boardId: 'b1',
  columnId,
  title: id,
  description: null,
  dueDate: null,
  dueTime: null,
  remindBefore: null,
  priority: 'none',
  labelIds: [],
  checklist: [],
  link: null,
  planModuleId: null,
  planDate: null,
  coverUrl: null,
  attachmentCount: 0,
  commentCount: 0,
  createdAt: '2026-10-01T08:00:00Z',
  doneAt: columnId === 'done' ? '2026-10-10T08:00:00Z' : null,
  ...extra,
});

const cols: BoardColumn[] = [
  { id: 'todo', name: 'To do', done: false },
  { id: 'doing', name: 'In progress', done: false },
  { id: 'done', name: 'Done', done: true },
];

const board = [card('a', 'todo'), card('b', 'todo'), card('c', 'todo'), card('d', 'doing'), card('e', 'done')];
const ids = (cards: BoardCard[]) => cards.map((c) => `${c.columnId}:${c.id}`);

describe('placeCard', () => {
  it('moves a card after another in its column', () => {
    expect(ids(placeCard(board, cols, 'a', 'todo', 'c', 'now'))).toEqual([
      'todo:b',
      'todo:c',
      'todo:a',
      'doing:d',
      'done:e',
    ]);
  });
  it('puts a card at the top of another column and marks when it was done', () => {
    const moved = placeCard(board, cols, 'b', 'done', null, '2026-10-13T09:00:00Z');
    expect(ids(moved)).toEqual(['todo:a', 'todo:c', 'doing:d', 'done:b', 'done:e']);
    expect(moved.find((c) => c.id === 'b')?.doneAt).toBe('2026-10-13T09:00:00Z');
    expect(placeCard(moved, cols, 'b', 'todo', null, 'x').find((c) => c.id === 'b')?.doneAt).toBeNull();
  });
  it('leaves the board as it was for an unknown card', () => {
    expect(ids(placeCard(board, cols, 'zz', 'done', null, 'now'))).toEqual(ids(board));
  });
});

describe('positions from the screen', () => {
  it('appends a new card to the end of its column', () => {
    expect(ids(appendCard(board, cols, card('f', 'doing')))).toEqual([
      'todo:a',
      'todo:b',
      'todo:c',
      'doing:d',
      'doing:f',
      'done:e',
    ]);
  });
  it('finds the card to go after for a drop before a card', () => {
    expect(afterIdBefore(board, 'c', 'todo', 'b')).toBe('a');
    expect(afterIdBefore(board, 'c', 'todo', 'a')).toBeNull();
    expect(afterIdBefore(board, 'a', 'todo', 'b')).toBeNull(); // without the moving card, b is first
    expect(afterIdBefore(board, 'd', 'todo', 'c')).toBe('b');
  });
  it('never names a card the API hasn’t answered for yet as the one to go after', () => {
    const adding = [card('a', 'todo'), card('b', 'todo'), card('new-1', 'todo'), card('d', 'doing')];
    expect(isUnsaved(card('new-1', 'todo'))).toBe(true);
    expect(afterIdBefore(adding, 'd', 'todo', 'new-1')).toBe('b');
    expect(lastIn(adding, 'todo', 'd')).toBe('b');
    expect(nudge(adding, 'a', 1)).toBe('b');
    expect(nudge(adding, 'b', 1)).toBeUndefined();
  });
  it('moves up and down within the column, and not past its ends', () => {
    expect(nudge(board, 'b', -1)).toBeNull();
    expect(nudge(board, 'b', 1)).toBe('c');
    expect(nudge(board, 'a', -1)).toBeUndefined();
    expect(nudge(board, 'c', 1)).toBeUndefined();
    expect(nudge(board, 'd', 1)).toBeUndefined();
  });
  it('places a board or a column after another, or first', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const order = (xs: { id: string }[]) => xs.map((x) => x.id).join('');
    expect(order(placeAfter(list, 'a', 'c'))).toBe('bca');
    expect(order(placeAfter(list, 'c', null))).toBe('cab');
    expect(order(placeAfter(list, 'b', 'a'))).toBe('abc');
    expect(order(placeAfter(list, 'b', 'gone'))).toBe('abc');
    expect(order(placeAfter(list, 'gone', 'a'))).toBe('abc');
  });
  it('counts the cards in each column', () => {
    expect(counts(board)).toEqual({ todo: 3, doing: 1, done: 1 });
  });
  it('finds neighbour columns', () => {
    expect(neighbourColumn(cols, 'todo', 1)?.id).toBe('doing');
    expect(neighbourColumn(cols, 'todo', -1)).toBeNull();
    expect(neighbourColumn(cols, 'done', 1)).toBeNull();
    expect(neighbourColumn(cols, 'done', -1)?.id).toBe('doing');
  });
});

describe('due dates', () => {
  const event = {
    type: 'event' as const,
    id: 'x',
    title: 'Exam',
    url: '/calendar?event=x',
    date: '2026-10-12',
    kind: null,
    moduleId: null,
  };
  it('uses the card’s own date, else its plan’s, else its event’s', () => {
    expect(dueOf(card('a', 'todo', { link: event, planDate: '2026-10-08' }))).toBe('2026-10-08');
    expect(dueOf(card('a', 'todo', { planDate: '2026-10-08', dueDate: '2026-10-09' }))).toBe('2026-10-09');
    expect(dueOf(card('a', 'todo', { link: event }))).toBe('2026-10-12');
    expect(dueOf(card('a', 'todo', { link: event, dueDate: '2026-10-20' }))).toBe('2026-10-20');
    expect(dueOf(card('a', 'todo'))).toBeNull();
  });
  it('is overdue only when past and not done', () => {
    expect(isOverdue(card('a', 'todo', { link: event }), '2026-10-13')).toBe(true);
    expect(isOverdue(card('a', 'todo', { link: event }), '2026-10-12')).toBe(false);
    expect(isOverdue(card('a', 'done', { link: event }), '2026-10-13')).toBe(false);
  });
  it('says when it is due', () => {
    expect(dueLabel('2026-10-13', '2026-10-13', '')).toBe('Due today');
    expect(dueLabel('2026-10-14', '2026-10-13', '')).toBe('Due tomorrow');
    expect(dueLabel('2026-10-16', '2026-10-13', '')).toBe('Due in 3 days');
    expect(dueLabel('2026-11-30', '2026-10-13', 'Mon 30 Nov')).toBe('Due Mon 30 Nov');
    expect(dueLabel('2026-10-12', '2026-10-13', '')).toBe('Overdue by 1 day');
    expect(dueLabel('2026-10-13', '2026-10-13', '', '14:30:00')).toBe('Due today at 14:30');
  });
});

describe('checklists', () => {
  it('calculates checklist progress', () => {
    const items = [
      { id: '1', text: 'Step 1', done: true },
      { id: '2', text: 'Step 2', done: false },
      { id: '3', text: 'Step 3', done: true },
    ];
    expect(checklistProgress(items)).toEqual({ done: 2, total: 3 });
  });
  it('moves items up and down', () => {
    const items = [
      { id: '1', text: 'Step 1', done: false },
      { id: '2', text: 'Step 2', done: false },
    ];
    expect(moveItem(items, '2', -1).map((i) => i.id)).toEqual(['2', '1']);
    expect(moveItem(items, '1', -1).map((i) => i.id)).toEqual(['1', '2']);
  });
});

describe('filters and agenda', () => {
  it('matches cards by labels and due filter', () => {
    const c1 = card('1', 'todo', { labelIds: ['l1', 'l2'], dueDate: '2026-10-14' });
    const c2 = card('2', 'todo', { labelIds: ['l1'], dueDate: '2026-10-20' });
    expect(matches(c1, { labels: ['l1'], due: 'any' }, '2026-10-14')).toBe(true);
    expect(matches(c1, { labels: ['l2'], due: 'today' }, '2026-10-14')).toBe(true);
    expect(matches(c2, { labels: ['l2'], due: 'any' }, '2026-10-14')).toBe(false);
    expect(matches(c2, { labels: [], due: 'week' }, '2026-10-14')).toBe(true);
  });
  it('drops a label that is gone from the filter', () => {
    const f = { labels: ['l1', 'gone'], due: 'any' as const };
    expect(withExistingLabels(f, (id) => id !== 'gone')).toEqual({ labels: ['l1'], due: 'any' });
    const kept = { labels: ['l1'], due: 'today' as const };
    expect(withExistingLabels(kept, () => true)).toBe(kept);
  });
  it('groups agenda into sections', () => {
    const ac = (id: string, due: string): AgendaCard => ({
      ...card(id, 'todo'),
      boardName: 'Study',
      boardEmoji: '📚',
      boardColor: 'cobalt',
      due,
    });
    const cards = [ac('1', '2026-10-13'), ac('2', '2026-10-14'), ac('3', '2026-10-15'), ac('4', '2026-10-18')];
    const sections = agendaSections(cards, '2026-10-14');
    expect(sections.map((s) => s.id)).toEqual(['overdue', 'today', 'tomorrow', 'week']);
    expect(sections.find((s) => s.id === 'overdue')?.cards.map((c) => c.id)).toEqual(['1']);
    expect(sections.find((s) => s.id === 'today')?.cards.map((c) => c.id)).toEqual(['2']);
    expect(sections.find((s) => s.id === 'tomorrow')?.cards.map((c) => c.id)).toEqual(['3']);
    expect(sections.find((s) => s.id === 'week')?.cards.map((c) => c.id)).toEqual(['4']);
  });
});

describe('splitDone', () => {
  it('folds cards done more than 14 days ago', () => {
    const done = [
      card('new', 'done', { doneAt: '2026-10-10T08:00:00Z' }),
      card('edge', 'done', { doneAt: '2026-09-29T08:00:00Z' }),
      card('old', 'done', { doneAt: '2026-09-01T08:00:00Z' }),
    ];
    const { recent, older } = splitDone(done, '2026-10-13');
    expect(recent.map((c) => c.id)).toEqual(['new', 'edge']);
    expect(older.map((c) => c.id)).toEqual(['old']);
  });
});

describe('revision plans', () => {
  it('says the pace', () => {
    expect(planPace({ left: 40, daysLeft: 6 })).toBe('About 7 a day');
    expect(planPace({ left: 3, daysLeft: 9 })).toBe('1 every 3 days');
    expect(planPace({ left: 5, daysLeft: 6 })).toBe('About 1 a day');
    expect(planPace({ left: 0, daysLeft: 6 })).toBe('All done.');
    expect(planPace({ left: 2, daysLeft: 0 })).toBe('The exam day has come.');
  });
});

describe('past papers', () => {
  const paper = {
    type: 'library_item' as const,
    id: 'p1',
    title: 'EC1002 2023 Zone A',
    url: '/library/p1',
    date: null,
    kind: 'past-paper' as const,
    moduleId: 'm',
  };
  it('knows a past paper card', () => {
    expect(isPastPaper(card('a', 'todo', { link: paper }))).toBe(true);
    expect(isPastPaper(card('a', 'todo', { link: { ...paper, kind: 'notes' } }))).toBe(false);
    expect(isPastPaper(card('a', 'todo'))).toBe(false);
  });
  it('counts sittings: a year and session (both zones in one), or a paper without a year on its own', () => {
    const papers: Paper[] = [
      { id: 'a', examYear: 2023, examSession: 'may' },
      { id: 'a2', examYear: 2023, examSession: 'may' },
      { id: 'b', examYear: 2023, examSession: 'october' },
      { id: 'c', examYear: null, examSession: null },
    ];
    expect(sittingsDone(papers, new Set(['a', 'a2', 'c']))).toEqual({ done: 2, total: 3 });
    expect(sittingsDone(papers, new Set())).toEqual({ done: 0, total: 3 });
  });
  it('reads a score as typed', () => {
    expect(parseScore('')).toBeNull();
    expect(parseScore(' 68 % ')).toBe(68);
    expect(parseScore('72.5')).toBe(72.5);
    expect(parseScore('101')).toBeUndefined();
    expect(parseScore('-3')).toBeUndefined();
    expect(parseScore('abc')).toBeUndefined();
  });
  it('sets, replaces and removes a paper’s score, the newest first', () => {
    const at = '2026-10-18T10:00:00Z';
    let list = withScore([], 'p1', 64, at);
    list = withScore(list, 'p2', 71.5, at);
    list = withScore(list, 'p1', 80, at);
    expect(scoresById(list)).toEqual({ p1: 80, p2: 71.5 });
    expect(list.map((s) => s.itemId)).toEqual(['p1', 'p2']);
    expect(scoresById(withScore(list, 'p2', null, at))).toEqual({ p1: 80 });
  });
  it('formats storage text', () => {
    expect(storageText(3.5 * 1024 * 1024, 200 * 1024 * 1024)).toBe('3.5 MB of 200 MB');
    expect(storageText(25 * 1024 * 1024, 200 * 1024 * 1024)).toBe('25 MB of 200 MB');
    expect(storageText(48 * 1024, 200 * 1024 * 1024)).toBe('48 KB of 200 MB');
  });
});

describe('templates and colours', () => {
  it('offers the templates with the columns the API makes, the last one done', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['study', 'assignment', 'weekly', 'personal', 'blank']);
    expect(TEMPLATES.find((t) => t.id === 'study')?.columns).toEqual(['To do', 'In progress', 'Done']);
    expect(TEMPLATES.find((t) => t.id === 'assignment')?.columns).toEqual(['Research', 'Draft', 'Review', 'Submitted']);
    expect(TEMPLATES.find((t) => t.id === 'weekly')?.columns).toHaveLength(8);
  });
  it('names a new board after its template, numbered when the name is taken', () => {
    expect(startName('Study', [])).toBe('Study');
    expect(startName('Study', ['study ', 'Personal'])).toBe('Study 2');
    expect(startName('Study', ['Study', 'Study 2'])).toBe('Study 3');
  });
  it('names a done column in a picker only when its name doesn’t say so', () => {
    expect(columnLabel({ name: 'Done', done: true })).toBe('Done');
    expect(columnLabel({ name: 'Submitted', done: true })).toBe('Submitted (done)');
    expect(columnLabel({ name: 'Done and dusted', done: true })).toBe('Done and dusted');
    expect(columnLabel({ name: 'To do', done: false })).toBe('To do');
  });
  it('has a text colour for every board colour', () => {
    expect(COLORS.map((c) => colorInk(c.id))).toEqual([
      'var(--cobalt)',
      'var(--y1-strong)',
      'var(--signal-strong)',
      'var(--y3-strong)',
      'var(--alert-strong)',
      'var(--ink-2)',
    ]);
  });
});

describe('what a card says', () => {
  it('turns a Markdown description into one line of plain text', () => {
    expect(plainText('Focus on **price elasticity** and the worked examples.\n\n- 3.1\n- 3.2')).toBe(
      'Focus on price elasticity and the worked examples. 3.1 3.2',
    );
    expect(plainText('## Plan\n1. Read [chapter 3](https://example.com/ch3)\n2. Try `lm()` on _the_ data')).toBe(
      'Plan Read chapter 3 Try lm() on the data',
    );
    expect(plainText('Rename file_name and my_var_2')).toBe('Rename file_name and my_var_2');
    expect(plainText('> a quote\n- [x] done item')).toBe('a quote done item');
    expect(plainText(null)).toBe('');
  });
  it('applies a change the way the API will', () => {
    const c = card('a', 'todo', { dueDate: '2026-10-20', dueTime: '09:00:00', description: 'x' });
    expect(patchCard(c, { title: 'New title' })).toMatchObject({
      title: 'New title',
      dueDate: '2026-10-20',
      description: 'x',
    });
    expect(patchCard(c, { dueDate: null })).toMatchObject({ dueDate: null, dueTime: null });
    expect(patchCard(c, { description: null }).description).toBeNull();
    expect(patchCard(c, { labelIds: ['l1'], priority: 'high' })).toMatchObject({ labelIds: ['l1'], priority: 'high' });
    expect(patchCard(c, { coverId: 'u1' }).coverUrl).toBe('/api/v1/board-files/u1');
    expect(patchCard(c, { coverId: null }).coverUrl).toBeNull();
    expect(patchCard(c, {})).toEqual(c);
  });
});
