import { describe, expect, it } from 'vitest';
import { cellAt, cellTones, findTone, lineCells, pointIn, snapEnd } from './search';

describe('lineCells', () => {
  it('walks straight lines in any of the eight directions', () => {
    expect(lineCells({ row: 0, col: 0 }, { row: 0, col: 3 })).toHaveLength(4);
    expect(lineCells({ row: 4, col: 4 }, { row: 1, col: 1 })).toEqual([
      { row: 4, col: 4 },
      { row: 3, col: 3 },
      { row: 2, col: 2 },
      { row: 1, col: 1 },
    ]);
    expect(lineCells({ row: 2, col: 2 }, { row: 2, col: 2 })).toEqual([{ row: 2, col: 2 }]);
  });

  it('refuses a line that bends', () => {
    expect(lineCells({ row: 0, col: 0 }, { row: 1, col: 3 })).toBeNull();
  });
});

describe('snapEnd', () => {
  const start = { row: 5, col: 5 };

  it('follows a drag that is straight already', () => {
    expect(snapEnd(start, { row: 5, col: 8 }, 10)).toEqual({ row: 5, col: 8 });
    expect(snapEnd(start, { row: 2, col: 2 }, 10)).toEqual({ row: 2, col: 2 });
  });

  it('keeps a wobbly drag on the nearest direction', () => {
    expect(snapEnd(start, { row: 5.4, col: 8.2 }, 10)).toEqual({ row: 5, col: 8 });
    expect(snapEnd(start, { row: 7.8, col: 8.3 }, 10)).toEqual({ row: 8, col: 8 });
    expect(snapEnd(start, { row: 1.2, col: 5.6 }, 10)).toEqual({ row: 1, col: 5 });
  });

  it('stops at the edge of the grid', () => {
    expect(snapEnd(start, { row: 5, col: 14 }, 10)).toEqual({ row: 5, col: 9 });
    expect(snapEnd({ row: 8, col: 1 }, { row: 12, col: -3 }, 10)).toEqual({ row: 9, col: 0 });
  });

  it('stays on the first letter until the drag leaves it', () => {
    expect(snapEnd(start, { row: 5.2, col: 5.3 }, 10)).toEqual(start);
  });
});

describe('pointIn and cellAt', () => {
  const rect = { left: 100, top: 50, width: 400, height: 400 };

  it('finds the cell under a point', () => {
    expect(cellAt(pointIn(120, 70, rect, 10), 10)).toEqual({ row: 0, col: 0 });
    expect(cellAt(pointIn(495, 445, rect, 10), 10)).toEqual({ row: 9, col: 9 });
    expect(cellAt(pointIn(320, 230, rect, 10), 10)).toEqual({ row: 4, col: 5 });
  });

  it('is nothing outside the grid', () => {
    expect(cellAt(pointIn(40, 70, rect, 10), 10)).toBeNull();
  });
});

describe('cellTones', () => {
  it('gives each crossed cell the colour of the last find over it, and none to words shown at the end', () => {
    const across = { start: { row: 0, col: 0 }, end: { row: 0, col: 3 }, revealed: false };
    const down = { start: { row: 0, col: 2 }, end: { row: 3, col: 2 }, revealed: false };
    const shown = { start: { row: 4, col: 0 }, end: { row: 4, col: 3 }, revealed: true };
    const tones = cellTones([across, down, shown]);
    expect(tones.get('0,0')).toBe(findTone(0));
    expect(tones.get('0,2')).toBe(findTone(1)); // the later find is on top
    expect(tones.get('3,2')).toBe(findTone(1));
    expect(tones.has('4,0')).toBe(false);
    expect(tones.size).toBe(7);
  });
});
