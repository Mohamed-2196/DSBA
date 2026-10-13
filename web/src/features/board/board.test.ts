import { describe, expect, it } from 'vitest';
import type { BoardCard } from '../../api/types';
import { afterIdAt, afterIdBefore, appendCard, counts, dueLabel, dueOf, isOverdue, nudge, placeCard, splitDone } from './board';

const card = (id: string, column: BoardCard['column'], extra: Partial<BoardCard> = {}): BoardCard => ({
  id,
  column,
  title: id,
  note: null,
  dueDate: null,
  link: null,
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
  const event = { type: 'event' as const, id: 'x', title: 'Exam', url: '/calendar?event=x', date: '2026-10-12' };
  it('uses the card’s own date, else its event’s', () => {
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
