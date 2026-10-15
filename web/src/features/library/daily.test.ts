import { describe, expect, it } from 'vitest';
import type { PaperQuestion } from '../../api/types';
import { DAILY_MIN_TAGS, dailyQuestion } from './daily';

function tag(n: number): PaperQuestion {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    paper: { id: 'za', slug: 'ec1002-za-may-2024', title: 'EC1002 ZA', examYear: 2024, examSession: 'may', zone: 'A', coverUrl: null },
    chapterId: 'c1',
    chapterTitle: 'Elasticity',
    question: n,
    page: null,
    flagged: false,
    flagCount: null,
    isMine: false,
    canRemove: false,
    createdAt: '2026-10-01T00:00:00Z',
  };
}

const tags = (count: number): PaperQuestion[] => Array.from({ length: count }, (_, i) => tag(i + 1));

describe('dailyQuestion', () => {
  it('stays hidden while a module has too few tags', () => {
    expect(dailyQuestion(tags(DAILY_MIN_TAGS - 1), '2026-10-14')).toBeNull();
    expect(dailyQuestion(tags(DAILY_MIN_TAGS), '2026-10-14')).not.toBeNull();
  });

  it('gives everyone the same question on a day, whatever order the tags arrive in', () => {
    const all = tags(12);
    expect(dailyQuestion([...all].reverse(), '2026-10-14')).toEqual(dailyQuestion(all, '2026-10-14'));
  });

  it('moves to a different question each day and comes round to them all', () => {
    const all = tags(12);
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const picked = days.map((d) => dailyQuestion(all, d)?.id);
    expect(new Set(picked).size).toBe(12);
    expect(picked[0]).not.toBe(picked[1]);
  });
});
