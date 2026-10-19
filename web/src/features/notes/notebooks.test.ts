import { describe, expect, it } from 'vitest';
import type { Notebook } from '../../api/types';
import { firstOwnNotebook } from './notebooks';

const book = (id: string, createdAt: string, over: Partial<Notebook> = {}): Notebook => ({
  id,
  title: 'My notebook',
  moduleId: null,
  noteCount: 0,
  createdAt,
  updatedAt: createdAt,
  ...over,
});

describe('the notebook a note without one goes to', () => {
  it('is the first of the student’s own, whatever its title', () => {
    const list = [
      book('m', '2026-01-01T00:00:00Z', { moduleId: 'ST2133', title: 'ST2133' }),
      book('later', '2026-03-01T00:00:00Z'),
      book('first', '2026-02-01T00:00:00Z', { title: 'Renamed long ago' }),
    ];
    expect(firstOwnNotebook(list)?.id).toBe('first');
    expect(firstOwnNotebook([list[0]])).toBeNull();
  });
});
