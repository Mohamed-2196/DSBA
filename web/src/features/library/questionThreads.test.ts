import { describe, expect, it } from 'vitest';
import { threadCounts, threadKey } from './questionThreads';

describe('threads per question', () => {
  it('looks a question up by its paper and number', () => {
    const counts = threadCounts([
      { paperSlug: 'st2133-may-2019', section: null, question: 3, threads: 2 },
      { paperSlug: 'st2133-may-2019', section: 'B', question: 1, threads: 1 },
    ]);
    const paper = { slug: 'st2133-may-2019' } as Parameters<typeof threadKey>[0]['paper'];
    expect(counts.get(threadKey({ paper, section: null, question: 3 }))).toBe(2);
    expect(counts.get(threadKey({ paper, section: 'B', question: 1 }))).toBe(1);
    expect(counts.get(threadKey({ paper, section: null, question: 1 }))).toBeUndefined();
    expect(threadCounts(undefined).size).toBe(0);
  });
});
