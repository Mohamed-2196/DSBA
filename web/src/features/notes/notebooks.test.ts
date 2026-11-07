import { describe, expect, it } from 'vitest';
import type { Notebook } from '../../api/types';
import { notebookActions } from './notebooks';

const book = (id: string, createdAt: string, over: Partial<Notebook> = {}): Notebook => ({
  id,
  title: 'My notebook',
  moduleId: null,
  noteCount: 0,
  createdAt,
  updatedAt: createdAt,
  ...over,
});

describe('what a student can do with a notebook', () => {
  const list = [
    book('m', '2026-01-01T00:00:00Z', { moduleId: 'ST2133', title: 'ST2133' }),
    book('first', '2026-02-01T00:00:00Z'),
    book('later', '2026-03-01T00:00:00Z'),
  ];

  it('deletes any of them, the first of their own and a module’s included', () => {
    for (const b of list) expect(notebookActions(b, { readOnly: false }).delete).toBe(true);
  });

  // The first of their own can be deleted, so the next would become "first": it must not lose Rename then.
  it('renames any of their own, the first included, but not a module’s', () => {
    expect(list.map((b) => notebookActions(b, { readOnly: false }).rename)).toEqual([false, true, true]);
  });

  it('does neither while the account is suspended', () => {
    for (const b of list) expect(notebookActions(b, { readOnly: true })).toEqual({ rename: false, delete: false });
  });
});
