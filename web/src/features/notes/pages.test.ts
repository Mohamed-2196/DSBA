import { describe, expect, it } from 'vitest';
import { pageMapping, pagesAfter, repaged, undoOf, type PageMove } from './pages';
import type { FreePicture } from './pictures/geometry';
import { PAPER_BASE } from './surface/layout';
import { FULL } from './text/picture';

const P = PAPER_BASE;
const moves = (change: PageMove, pages: number) =>
  Object.fromEntries([...pageMapping(change, pages)].map(([k, v]) => [k - P, v === null ? null : v - P]));
const picture = (id: string, sheet: number): FreePicture => ({
  id,
  upload: 'u',
  sheet,
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  angle: 0,
  ratio: 1,
  crop: FULL,
  alt: '',
  caption: '',
});

describe('changing the pages', () => {
  it('moves the pages after a page added or deleted, as the API does', () => {
    expect(moves({ action: 'insert', page: 1 }, 3)).toEqual({ 1: 2, 2: 3 });
    expect(moves({ action: 'insert', page: 3 }, 3)).toEqual({});
    expect(moves({ action: 'delete', page: 0 }, 3)).toEqual({ 0: null, 1: 0, 2: 1 });
    expect(moves({ action: 'delete', page: 2 }, 3)).toEqual({ 2: null });
    expect(pagesAfter({ action: 'delete', page: 2 }, 3)).toBe(2);
  });

  it('makes room for a page moved up or down', () => {
    expect(moves({ action: 'move', page: 0, to: 2 }, 3)).toEqual({ 0: 2, 1: 0, 2: 1 });
    expect(moves({ action: 'move', page: 2, to: 0 }, 3)).toEqual({ 2: 0, 0: 1, 1: 2 });
    expect(moves({ action: 'move', page: 1, to: 2 }, 3)).toEqual({ 1: 2, 2: 1 });
    expect(pagesAfter({ action: 'move', page: 1, to: 2 }, 3)).toBe(3);
  });

  it('takes the pictures along, and away with a deleted page', () => {
    const list = [picture('a', P), picture('b', P + 1), picture('c', P + 2), picture('pdf', 0)];
    const after = repaged(list, pageMapping({ action: 'delete', page: 1 }, 3));
    expect(after.map((p) => [p.id, p.sheet])).toEqual([
      ['a', P],
      ['c', P + 1],
      ['pdf', 0],
    ]);
  });

  it('knows the change that takes one back', () => {
    for (const change of [
      { action: 'insert', page: 2 },
      { action: 'delete', page: 0 },
      { action: 'move', page: 0, to: 1 },
    ] as const) {
      const back = pageMapping(undoOf(change), pagesAfter(change, 3));
      const there = pageMapping(change, 3);
      // every page that survives comes back to where it was
      for (const [from, to] of there) if (to !== null) expect(back.get(to) ?? to).toBe(from);
    }
  });
});
