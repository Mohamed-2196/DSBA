import { describe, expect, it } from 'vitest';
import { nearlyFull } from './storage';

const MB = 1024 * 1024;
const use = (writing: number, files: number) => ({
  writingBytes: writing * MB,
  writingLimitBytes: 25 * MB,
  filesBytes: files * MB,
  filesLimitBytes: 250 * MB,
});

describe('notebook storage', () => {
  it('shows nothing while there is room', () => {
    expect(nearlyFull(use(1, 1))).toEqual([]);
    expect(nearlyFull(use(19.9, 199))).toEqual([]);
  });

  it('shows each budget from 80% used, with what makes room', () => {
    expect(nearlyFull(use(20, 1)).map((b) => b.label)).toEqual(['Text and handwriting']);
    expect(nearlyFull(use(1, 240)).map((b) => b.label)).toEqual(['Pictures and files']);
    const both = nearlyFull(use(25, 250));
    expect(both).toHaveLength(2);
    expect(both[1]).toMatchObject({ used: 250 * MB, limit: 250 * MB, room: expect.stringContaining('Delete') });
  });

  it('shows nothing for a budget without a limit', () => {
    expect(nearlyFull({ writingBytes: 5, writingLimitBytes: 0, filesBytes: 0, filesLimitBytes: 0 })).toEqual([]);
  });
});
