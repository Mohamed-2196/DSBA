// Data Mine's geometry: straight lines across the grid, snapping a drag to the nearest of the eight directions,
// and which cell sits under a point.

export interface Pos {
  row: number;
  col: number;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];

export const samePos = (a: Pos | null | undefined, b: Pos | null | undefined): boolean =>
  !!a && !!b && a.row === b.row && a.col === b.col;

export const posKey = (p: Pos): string => `${p.row},${p.col}`;

/** The cells on the straight line from `start` to `end` (across, down or diagonal), or null when it isn't one. */
export function lineCells(start: Pos, end: Pos): Pos[] | null {
  const dr = end.row - start.row;
  const dc = end.col - start.col;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = Math.sign(dr);
  const sc = Math.sign(dc);
  return Array.from({ length: steps + 1 }, (_, i) => ({ row: start.row + sr * i, col: start.col + sc * i }));
}

/**
 * The end of a line from `start` towards `to` (a point in cell units, fractions allowed), kept to one of the eight
 * directions and inside a `size` by `size` grid: what a drag selects while it's on its way.
 */
export function snapEnd(start: Pos, to: { row: number; col: number }, size: number): Pos {
  const dr = to.row - start.row;
  const dc = to.col - start.col;
  if (Math.hypot(dr, dc) < 0.5) return start;
  let best: { ur: number; uc: number; t: number; miss: number } | null = null;
  for (const [ur, uc] of DIRECTIONS) {
    const t = Math.round((dr * ur + dc * uc) / (ur * ur + uc * uc));
    if (t <= 0) continue;
    const miss = (start.row + ur * t - to.row) ** 2 + (start.col + uc * t - to.col) ** 2;
    if (!best || miss < best.miss) best = { ur, uc, t, miss };
  }
  if (!best) return start;
  const { ur, uc } = best;
  let { t } = best;
  const inside = (n: number) => {
    const r = start.row + ur * n;
    const c = start.col + uc * n;
    return r >= 0 && r < size && c >= 0 && c < size;
  };
  while (t > 0 && !inside(t)) t -= 1;
  return { row: start.row + ur * t, col: start.col + uc * t };
}

/** The point (x, y) in cell units of a grid drawn in `rect`, `size` cells a side: 0.5 is the middle of a cell. */
export function pointIn(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
  size: number,
): { row: number; col: number } {
  return { row: ((y - rect.top) / rect.height) * size - 0.5, col: ((x - rect.left) / rect.width) * size - 0.5 };
}

/** The cell under a point in cell units, or null outside the grid. */
export function cellAt(point: { row: number; col: number }, size: number): Pos | null {
  const row = Math.round(point.row);
  const col = Math.round(point.col);
  return row >= 0 && row < size && col >= 0 && col < size ? { row, col } : null;
}

/** The colour slot (0-7) of the nth word found, so neighbouring finds look different. */
export const findTone = (index: number): number => (index * 3) % 8;
