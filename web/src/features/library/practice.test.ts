import { describe, expect, it } from 'vitest';
import type { PaperQuestion, QuestionMark } from '../../api/types';
import {
  chapterPractice,
  filtered,
  marksByKey,
  nextAfter,
  practiseList,
  practisePath,
  progressLabel,
  progressOf,
  startAt,
  tagKey,
  withMark,
} from './practice';

function q(id: string, question: number, chapterId = 'c1', patch: Partial<PaperQuestion> = {}): PaperQuestion {
  return {
    id,
    paper: {
      id: patch.paper?.id ?? 'p1',
      slug: 'ec1002-za-may-2024',
      title: 'EC1002 ZA',
      examYear: 2024,
      examSession: 'may',
      zone: 'A',
      coverUrl: null,
    },
    chapterId,
    chapterTitle: chapterId === 'c1' ? 'Elasticity' : 'Costs',
    section: null,
    question,
    page: null,
    flagged: false,
    flagCount: null,
    isMine: false,
    canRemove: false,
    createdAt: '2026-10-01T00:00:00Z',
    answer: null,
    ...patch,
  };
}

function mark(question: number, m: QuestionMark['mark'], section: string | null = null): QuestionMark {
  return { itemId: 'p1', section, question, mark: m, updatedAt: '2026-10-20T00:00:00Z' };
}

const LIST = [q('a', 1), q('b', 2), q('c', 3), q('d', 1, 'c2'), q('e', 4)];

describe('practising a chapter', () => {
  it('keys a question by its paper and number, whatever the chapter', () => {
    expect(tagKey(q('x', 3))).toBe('p1/Q3');
    expect(tagKey(q('y', 1, 'c1', { section: 'B' }))).toBe('p1/B1');
    expect(marksByKey([mark(1, 'done', 'B')]).get('p1/B1')).toBe('done');
  });

  it("lists a chapter's questions once each, in the API's order", () => {
    expect(practiseList([...LIST, q('dup', 2)], 'c1').map((x) => x.id)).toEqual(['a', 'b', 'c', 'e']);
  });

  it('counts progress once per question and says it plainly', () => {
    const marks = marksByKey([mark(1, 'done'), mark(2, 'stuck'), mark(3, 'skipped')]);
    const p = progressOf(practiseList(LIST, 'c1'), marks);
    expect(p).toEqual({ total: 4, done: 1, stuck: 1, skipped: 1 });
    expect(progressLabel(p)).toBe('1 of 4 done, 1 stuck');
    expect(progressLabel({ total: 87, done: 0, stuck: 0, skipped: 0 })).toBe('0 of 87 done');
    // the module: Q1 is in two chapters, counted once
    expect(progressOf(LIST, marks).total).toBe(4);
    expect(chapterPractice(LIST, marks).map((c) => [c.chapterId, c.title, c.progress.total])).toEqual([
      ['c1', 'Elasticity', 4],
      ['c2', 'Costs', 1],
    ]);
  });

  it('filters to the questions not done, or the stuck ones', () => {
    const list = practiseList(LIST, 'c1');
    const marks = marksByKey([mark(1, 'done'), mark(2, 'stuck'), mark(3, 'skipped')]);
    expect(filtered(list, marks, 'all')).toHaveLength(4);
    expect(filtered(list, marks, 'todo').map((x) => x.question)).toEqual([2, 3, 4]);
    expect(filtered(list, marks, 'stuck').map((x) => x.question)).toEqual([2]);
  });

  it('starts at the first question without a mark and moves on to the next one', () => {
    const list = practiseList(LIST, 'c1');
    expect(startAt(list, marksByKey([mark(1, 'done')]))).toBe(1);
    expect(startAt(list, marksByKey(list.map((x) => mark(x.question, 'done'))))).toBe(0);
    const marks = marksByKey([mark(1, 'done'), mark(3, 'done')]);
    expect(nextAfter(list, marks, 1)).toBe(3); // Q3 has a mark: on to Q4
    expect(nextAfter(list, marks, 3)).toBe(1); // round to Q2, still unmarked
    expect(nextAfter(list, marksByKey(list.map((x) => mark(x.question, 'done'))), 3)).toBeNull();
  });

  it('sets and takes off a mark, the newest first', () => {
    const before = [mark(1, 'done')];
    const set = withMark(before, { itemId: 'p1', section: null, question: 2, mark: 'stuck' }, 'now');
    expect(set.map((m) => [m.question, m.mark])).toEqual([
      [2, 'stuck'],
      [1, 'done'],
    ]);
    expect(withMark(set, { itemId: 'p1', section: null, question: 1, mark: null }, 'now')).toHaveLength(1);
  });

  it('links to the practise page', () => {
    expect(practisePath('economics', 'ec1002-2')).toBe('/modules/economics/practise/ec1002-2');
  });
});
