import { describe, expect, it } from 'vitest';
import type { ThreadSummary } from '../../../api/types';
import { pickBelow, yearsBelow } from './helpBelow';

const thread = (id: string, fields: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id,
  slug: id,
  title: `Question ${id}`,
  excerpt: '',
  category: 'year-1',
  moduleId: null,
  year: 1,
  tags: [],
  author: null,
  authorYear: 1,
  createdAt: `2026-10-${id.padStart(2, '0')}T08:00:00Z`,
  lastActivityAt: `2026-10-${id.padStart(2, '0')}T08:00:00Z`,
  voteCount: 0,
  replyCount: 0,
  voted: false,
  answered: false,
  pinned: false,
  locked: false,
  status: 'visible',
  image: null,
  isMine: false,
  anonymous: false,
  ...fields,
});

describe('help the year below', () => {
  it('finds the years below', () => {
    expect(yearsBelow(1)).toEqual([]);
    expect(yearsBelow(2)).toEqual([1]);
    expect(yearsBelow(3)).toEqual([1, 2]);
    expect(yearsBelow(null)).toEqual([]);
  });

  it('keeps unanswered questions from the years below, newest first, three at most', () => {
    const threads = [
      thread('1'),
      thread('2', { year: 2 }),
      thread('3', { year: null }), // forum-wide
      thread('4', { replyCount: 1 }),
      thread('5', { pinned: true }),
      thread('6', { isMine: true }),
      thread('7', { year: 3 }),
      thread('8'),
      thread('9'),
      thread('9'), // the same thread from two lists
      thread('10', { status: 'hidden' }),
    ];
    expect(pickBelow(threads, [1]).map((t) => t.id)).toEqual(['9', '8', '1']);
    expect(pickBelow(threads, [1, 2], 5).map((t) => t.id)).toEqual(['9', '8', '2', '1']);
  });
});
