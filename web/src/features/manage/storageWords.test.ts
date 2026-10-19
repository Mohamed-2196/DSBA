import { describe, expect, it } from 'vitest';
import { formatStorage, usedPercent } from './storageWords';

const MB = 1024 * 1024;

describe('formatStorage', () => {
  it('keeps KB and MB below a gigabyte, and shows GB from there', () => {
    expect(formatStorage(0)).toBe('0 KB');
    expect(formatStorage(250 * MB)).toBe('250 MB');
    expect(formatStorage(1024 * MB)).toBe('1.0 GB');
    expect(formatStorage(50 * 1024 * MB)).toBe('50 GB');
  });
});

describe('usedPercent', () => {
  it('is a whole percent in range, and never 0 while something is used', () => {
    expect(usedPercent(0, 100)).toBe(0);
    expect(usedPercent(1, 10_000)).toBe(1);
    expect(usedPercent(50, 100)).toBe(50);
    expect(usedPercent(500, 100)).toBe(100);
    expect(usedPercent(5, 0)).toBe(0);
  });
});
