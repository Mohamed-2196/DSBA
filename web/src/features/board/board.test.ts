import { describe, expect, it } from 'vitest';
import type { BoardCard } from '../../api/types';
import { afterIdAt, afterIdBefore, appendCard, counts, dueLabel, dueOf, isOverdue, isPastPaper, nudge, parseScore, placeCard, planPace, sittingsDone, splitDone } from './board';
import { cleanScores } from './scores';

const card = (id: string, column: BoardCard['column'], extra: Partial<BoardCard> = {}): BoardCard => ({
  id,
  column,
  title: id,
  note: null,
  dueDate: null,
  link: null,
  planModuleId: null,
  planDate: null,
  createdAt: '2026-10-01T08:00:00Z',
  doneAt: column === 'done' ? '2026-10-10T08:00:00Z' : null,
  ...extra,
});

const board = [card('a', 'todo'), card('b', 'todo'), card('c', 'todo'), card('d', 'doing'), card('e', 'done')];
const ids = (cards: BoardCard[]) => cards.map((c) => `${c.column}:${c.id}`);

describe('placeCard', () => {
  it('moves a card after another in its column', () => {
    expect(ids(placeCard(board, 'a', 'todo', 'c', 'now'))).toEqual(['todo:b', 'todo:c', 'todo:a', 'doing:d', 'done:e']);
  });
  it('puts a card at the top of another column and marks when it was done', () => {
    const moved = placeCard(board, 'b', 'done', null, '2026-10-13T09:00:00Z');
    expect(ids(moved)).toEqual(['todo:a', 'todo:c', 'doing:d', 'done:b', 'done:e']);
    expect(moved.find((c) => c.id === 'b')?.doneAt).toBe('2026-10-13T09:00:00Z');
    expect(placeCard(moved, 'b', 'todo', null, 'x').find((c) => c.id === 'b')?.doneAt).toBeNull();
  });
  it('leaves the board as it was for an unknown card', () => {
    expect(ids(placeCard(board, 'zz', 'done', null, 'now'))).toEqual(ids(board));
  });
});

describe('positions from the screen', () => {
  it('appends a new card to the end of its column', () => {
    expect(ids(appendCard(board, card('f', 'doing')))).toEqual(['todo:a', 'todo:b', 'todo:c', 'doing:d', 'doing:f', 'done:e']);
  });
  it('finds the card to go after for a drop before a card', () => {
    expect(afterIdBefore(board, 'c', 'todo', 'b')).toBe('a');
    expect(afterIdBefore(board, 'c', 'todo', 'a')).toBeNull();
    expect(afterIdBefore(board, 'a', 'todo', 'b')).toBeNull(); // without the moving card, b is first
    expect(afterIdBefore(board, 'd', 'todo', 'c')).toBe('b');
  });
  it('finds the card to go after for an index', () => {
    expect(afterIdAt(board, 'a', 'todo', 0)).toBeNull();
    expect(afterIdAt(board, 'a', 'todo', 2)).toBe('c');
    expect(afterIdAt(board, 'd', 'todo', 99)).toBe('c');
  });
  it('moves up and down within the column, and not past its ends', () => {
    expect(nudge(board, 'b', -1)).toBeNull();
    expect(nudge(board, 'b', 1)).toBe('c');
    expect(nudge(board, 'a', -1)).toBeUndefined();
    expect(nudge(board, 'c', 1)).toBeUndefined();
    expect(nudge(board, 'd', 1)).toBeUndefined();
  });
  it('counts the cards in each column', () => {
    expect(counts(board)).toEqual({ todo: 3, doing: 1, done: 1 });
  });
});

describe('due dates', () => {
  const event = { type: 'event' as const, id: 'x', title: 'Exam', url: '/calendar?event=x', date: '2026-10-12', kind: null, moduleId: null };
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
  });
});

describe('splitDone', () => {
  it('folds cards done more than 14 days ago', () => {
    const done = [card('new', 'done', { doneAt: '2026-10-10T08:00:00Z' }), card('edge', 'done', { doneAt: '2026-09-29T08:00:00Z' }), card('old', 'done', { doneAt: '2026-09-01T08:00:00Z' })];
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
  const paper = { type: 'library_item' as const, id: 'p1', title: 'EC1002 2023 Zone A', url: '/library/p1', date: null, kind: 'past-paper' as const, moduleId: 'm' };
  it('knows a past paper card', () => {
    expect(isPastPaper(card('a', 'todo', { link: paper }))).toBe(true);
    expect(isPastPaper(card('a', 'todo', { link: { ...paper, kind: 'notes' } }))).toBe(false);
    expect(isPastPaper(card('a', 'todo'))).toBe(false);
  });
  it('counts sittings: a year and session (both zones in one), or a paper without a year on its own', () => {
    const papers = [
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
  it('keeps only sane stored scores', () => {
    expect(cleanScores({ a: 50, b: 'x', c: 140, d: 0 })).toEqual({ a: 50, d: 0 });
    expect(cleanScores([1, 2])).toEqual({});
    expect(cleanScores(null)).toEqual({});
  });
});
