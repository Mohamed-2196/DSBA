import { describe, expect, it } from 'vitest';
import { managerOrder } from './manage';

describe('managerOrder', () => {
  it('puts drafts first, then published issues, newest first', () => {
    const issues = [
      { id: 'p1', status: 'published', date: '2026-09-01', number: 1 },
      { id: 'd1', status: 'draft', date: '2026-10-01', number: 3 },
      { id: 'p2', status: 'published', date: '2026-10-14', number: 2 },
      { id: 'd2', status: 'draft', date: '2026-10-20', number: 4 },
      { id: 'p3', status: 'published', date: '2026-10-14', number: 5 },
    ] as const;
    expect(managerOrder(issues).map((i) => i.id)).toEqual(['d2', 'd1', 'p3', 'p2', 'p1']);
  });
});
