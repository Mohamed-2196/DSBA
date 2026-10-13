import { describe, expect, it } from 'vitest';
import { formatCount } from './utils';

describe('formatCount', () => {
  it('separates thousands, as everywhere in the Hub', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1234)).toBe('1,234');
    expect(formatCount(12345)).toBe('12,345');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('shows whole numbers', () => {
    expect(formatCount(1234.6)).toBe('1,235');
  });
});
