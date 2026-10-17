import { describe, expect, it } from 'vitest';
import { restsAway } from './away';

describe('where she waits out of sight', () => {
  it('stays off the full page and the daily games', () => {
    expect(restsAway('/noora')).toBe(true);
    expect(restsAway('/daily/sudoku')).toBe(true);
    expect(restsAway('/daily/2026-10-17/word')).toBe(true);
  });

  it('rests everywhere else', () => {
    expect(restsAway('/')).toBe(false);
    expect(restsAway('/daily')).toBe(false);
    expect(restsAway('/library')).toBe(false);
    expect(restsAway('/noora-tips')).toBe(false);
  });
});
