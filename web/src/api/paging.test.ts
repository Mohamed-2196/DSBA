import { describe, expect, it } from 'vitest';
import { nextOffset, remainingCount } from './paging';

const page = (offset: number, count: number, total: number) => ({
  offset,
  total,
  items: Array.from({ length: count }, (_, i) => i),
});

describe('nextOffset', () => {
  it('asks for the next page while there is more', () => {
    expect(nextOffset(page(0, 20, 45))).toBe(20);
    expect(nextOffset(page(20, 20, 45))).toBe(40);
  });

  it('stops at the end of the list', () => {
    expect(nextOffset(page(40, 5, 45))).toBeUndefined();
    expect(nextOffset(page(0, 3, 3))).toBeUndefined();
    expect(nextOffset(page(0, 0, 0))).toBeUndefined();
  });

  it('stops on an empty page even when the total says there is more', () => {
    // The list shrank while paging (items deleted): asking again would return the same empty page.
    expect(nextOffset(page(40, 0, 45))).toBeUndefined();
  });
});

describe('remainingCount', () => {
  it('counts what is not loaded yet', () => {
    expect(remainingCount([page(0, 20, 45), page(20, 20, 45)])).toBe(5);
    expect(remainingCount([page(0, 3, 3)])).toBe(0);
    expect(remainingCount([])).toBe(0);
    expect(remainingCount(undefined)).toBe(0);
  });
});
