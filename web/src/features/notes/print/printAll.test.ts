import { describe, expect, it } from 'vitest';
import { MAX_PRINT, noteLine, printOrder, progressLine } from './printAll';

const note = (id: string, createdAt: string) => ({ id, createdAt });

describe('printing a module’s notes', () => {
  it('prints them oldest first', () => {
    const list = [
      note('c', '2026-10-03T09:00:00Z'),
      note('a', '2026-10-01T09:00:00Z'),
      note('b', '2026-10-02T09:00:00Z'),
    ];
    expect(printOrder(list, 3)).toEqual({ notes: [list[1], list[2], list[0]], left: 0 });
  });

  it('keeps the ones edited last when there are too many, and says how many are left out', () => {
    const list = Array.from({ length: MAX_PRINT + 2 }, (_, i) =>
      note(`n${i}`, `2026-10-${String(32 - i).padStart(2, '0')}`),
    );
    const { notes, left } = printOrder(list, 40);
    expect(notes).toHaveLength(MAX_PRINT);
    expect(notes.map((n) => n.id)).not.toContain(`n${MAX_PRINT}`);
    expect(left).toBe(10);
  });

  it('names each note and says how far it got', () => {
    expect(noteLine({ title: 'Estimators', excerpt: '', createdAt: '2026-10-12T09:00:00Z' })).toBe(
      'Estimators · 12 October 2026',
    );
    expect(progressLine(0, 1, 0)).toBe('Preparing your note.');
    expect(progressLine(2, 12, 0)).toBe('Preparing note 3 of 12.');
    expect(progressLine(12, 12, 1)).toBe(
      'Preparing note 12 of 12. Only the 30 you edited last print, oldest first: 1 more is left out.',
    );
  });
});
