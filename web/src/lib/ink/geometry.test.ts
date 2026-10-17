import { describe, expect, it } from 'vitest';
import { addPoint, eraseFrom, inPolygon, lassoed, moved, strokeBounds, strokePath, touches, type InkStroke } from './geometry';
import { laserSegments, liveTrail } from './laser';

const line = (id: string, from: number, to: number, y = 10): InkStroke => {
  const points: number[] = [];
  for (let x = from; x <= to; x += 2) points.push(x, y, 0.5);
  return { id, tool: 'pen', color: '#000000', width: 2, points };
};

describe('ink geometry', () => {
  it('keeps a point only when the pen moved', () => {
    const pts: number[] = [];
    addPoint(pts, 1, 1, 0.4);
    addPoint(pts, 1.2, 1.1, 0.4);
    addPoint(pts, 3, 1, 1.4);
    expect(pts).toEqual([1, 1, 0.4, 3, 1, 1]);
  });

  it('draws a closed path, and a dot for a tap', () => {
    expect(strokePath(line('a', 0, 40))).toMatch(/^M.*Z$/);
    expect(strokePath({ ...line('a', 0, 0) })).toMatch(/^M.*Z$/);
  });

  it('measures and finds strokes', () => {
    const s = line('a', 0, 20);
    expect(strokeBounds(s)).toEqual({ x: -1, y: 9, w: 22, h: 2 });
    expect(touches(s, 10, 13, 2)).toBe(true);
    expect(touches(s, 10, 20, 2)).toBe(false);
  });

  it('erases part of a stroke, leaving the pieces', () => {
    const s = line('a', 0, 40);
    const pieces = eraseFrom(s, 20, 10, 3);
    expect(pieces).toHaveLength(2);
    expect(pieces.every((p) => p.id !== 'a')).toBe(true);
    expect(Math.max(...pieces[0].points.filter((_, i) => i % 3 === 0))).toBeLessThan(18);
    expect(eraseFrom(s, 20, 40, 3)).toEqual([s]); // untouched
    expect(eraseFrom(line('b', 0, 2), 1, 10, 5)).toEqual([]); // all of it
  });

  it('selects with a lasso and moves what it holds', () => {
    const square = [
      [0, 0],
      [30, 0],
      [30, 30],
      [0, 30],
    ] as const;
    expect(inPolygon(5, 5, square)).toBe(true);
    expect(inPolygon(35, 5, square)).toBe(false);
    const inside = line('in', 2, 20);
    const half = line('half', 10, 60);
    expect(lassoed([inside, half], square).map((s) => s.id)).toEqual(['in']);
    expect(moved(inside, 5, -2).points.slice(0, 3)).toEqual([7, 8, 0.5]);
  });
});

describe('laser', () => {
  it('fades and drops old points', () => {
    const trail = [
      { x: 0, y: 0, t: 0 },
      { x: 5, y: 0, t: 16 },
      { x: 9, y: 0, t: 500 },
    ];
    expect(liveTrail(trail, 1000)).toHaveLength(1);
    const segs = laserSegments(trail, 100);
    expect(segs).toHaveLength(1); // the gap between 16 and 500 ms breaks the trail
    expect(segs[0].alpha).toBeGreaterThan(0.8);
  });
});
