import { describe, expect, it } from 'vitest';
import { keepRowKey, rowKeyOf } from './state';

describe('row keys', () => {
  it('keys a saved item by its id', () => {
    expect(rowKeyOf({}, 'employers', 'acme')).toBe('employers:acme');
  });

  it('keeps a new item’s key while its id follows its name', () => {
    const added = keepRowKey({}, 'employers', 'new');
    const key = rowKeyOf(added, 'employers', 'new');
    const renamed = keepRowKey(added, 'employers', 'acme', 'new');
    expect(rowKeyOf(renamed, 'employers', 'acme')).toBe(key);
    expect(rowKeyOf(keepRowKey(renamed, 'employers', 'acme-bank', 'acme'), 'employers', 'acme-bank')).toBe(key);
  });

  it('gives the next new item its own key, though it takes the first one’s old id', () => {
    const first = keepRowKey(keepRowKey({}, 'employers', 'new'), 'employers', 'acme', 'new');
    const second = keepRowKey(first, 'employers', 'new');
    expect(rowKeyOf(second, 'employers', 'new')).not.toBe(rowKeyOf(second, 'employers', 'acme'));
  });

  it('keeps sections apart', () => {
    const keys = keepRowKey({}, 'tracks', 'new');
    expect(rowKeyOf(keys, 'employers', 'new')).toBe('employers:new');
  });
});
