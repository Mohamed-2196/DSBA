// Data Mine's board, as DSBA Daily plays it: which letter a finger is over, and how a drag or a tap grows the traced
// path (letters that touch, diagonals too, none twice). The server checks the word; these keep the tracing honest.

export interface Pos {
  row: number;
  col: number;
}

export const samePos = (a: Pos | null | undefined, b: Pos | null | undefined): boolean =>
  !!a && !!b && a.row === b.row && a.col === b.col;

export const posKey = (p: Pos): string => `${p.row},${p.col}`;

/** Two different letters next to each other, diagonals too. */
export const touches = (a: Pos, b: Pos): boolean =>
  !samePos(a, b) && Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;

/** The letter under a point given as fractions of the board (0-1 across, 0-1 down), or null between letters: only
 *  near a letter's centre counts, so a diagonal drag doesn't clip the letters beside it. */
export function cellAt(x: number, y: number, rows: number, cols: number): Pos | null {
  const cx = x * cols;
  const cy = y * rows;
  const col = Math.floor(cx);
  const row = Math.floor(cy);
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  if (Math.hypot(cx - (col + 0.5), cy - (row + 0.5)) > 0.42) return null;
  return { row, col };
}

/** The path a drag makes when the finger reaches `cell`: one letter longer, one shorter (back over the last letter),
 *  or as it was. `usable` says whether a letter is free (not in a word found already). */
export function dragTo(path: readonly Pos[], cell: Pos, usable: (p: Pos) => boolean): Pos[] {
  const last = path[path.length - 1];
  if (!last || samePos(last, cell)) return [...path];
  if (path.length > 1 && samePos(path[path.length - 2], cell)) return path.slice(0, -1);
  if (touches(last, cell) && usable(cell) && !path.some((p) => samePos(p, cell))) return [...path, cell];
  return [...path];
}

/** A tap: tapping the last letter again sends the word, a letter already in the path cuts it back to there, a letter
 *  touching the last one adds it, and any other letter starts again from it. */
export function tapAt(path: readonly Pos[], cell: Pos, usable: (p: Pos) => boolean): { path: Pos[]; send: boolean } {
  const last = path[path.length - 1];
  if (!last) return { path: [cell], send: false };
  if (samePos(last, cell)) return path.length > 1 ? { path: [...path], send: true } : { path: [], send: false };
  const at = path.findIndex((p) => samePos(p, cell));
  if (at >= 0) return { path: path.slice(0, at + 1), send: false };
  if (touches(last, cell) && usable(cell)) return { path: [...path, cell], send: false };
  return { path: [cell], send: false };
}

/** An SVG path through the letters' centres, `unit` a letter's size. */
export function linePath(path: readonly Pos[], unit: number): string {
  return path.map((p, i) => `${i ? 'L' : 'M'}${p.col * unit + unit / 2} ${p.row * unit + unit / 2}`).join(' ');
}
