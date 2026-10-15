// The ink engine's geometry: how a stroke looks (a smooth outline that follows the pen's pressure), and how it is
// found, erased, selected and moved. Pure functions over plain strokes, in the units of the sheet they are on.
import { getStroke } from 'perfect-freehand';

export type InkTool = 'pen' | 'highlighter';

/** One line drawn on a sheet. `points` is x, y, pressure (0-1), x, y, pressure, … */
export interface InkStroke {
  id: string;
  tool: InkTool;
  color: string;
  width: number;
  points: number[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Point = readonly [number, number];

/** A fresh id for a stroke: short, unique enough within a note. */
export function strokeId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
}

/** How many points a stroke has. */
export const pointCount = (s: Pick<InkStroke, 'points'>): number => Math.floor(s.points.length / 3);

/** A point is kept only when the pen moved at least this far (sheet units): fewer points, the same line. */
export const MIN_STEP = 0.6;

/** Adds a point unless it is too close to the last one. Mutates `points` (a stroke being drawn). */
export function addPoint(points: number[], x: number, y: number, pressure: number): void {
  const n = points.length;
  if (n >= 3) {
    const dx = x - points[n - 3];
    const dy = y - points[n - 2];
    if (dx * dx + dy * dy < MIN_STEP * MIN_STEP) return;
  }
  points.push(round(x), round(y), round(Math.min(1, Math.max(0, pressure))));
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Whether a stroke carries real pressure (a stylus), rather than the 0.5 every mouse and finger reports. */
function hasPressure(points: readonly number[]): boolean {
  for (let i = 2; i < points.length; i += 3) if (points[i] !== 0.5 && points[i] !== 0) return true;
  return false;
}

/** The stroke's outline: a closed polygon around it, thicker where the pen pressed harder. */
export function strokeOutline(stroke: InkStroke, complete = true): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i + 2 < stroke.points.length; i += 3) pts.push([stroke.points[i], stroke.points[i + 1], stroke.points[i + 2]]);
  const highlighter = stroke.tool === 'highlighter';
  return getStroke(pts, {
    size: stroke.width,
    thinning: highlighter ? 0 : 0.55,
    smoothing: 0.5,
    streamline: highlighter ? 0.6 : 0.45,
    simulatePressure: !highlighter && !hasPressure(stroke.points),
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last: complete,
  });
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** An SVG path for an outline, smoothed with quadratic curves through the midpoints. */
export function outlinePath(outline: number[][]): string {
  const n = outline.length;
  if (n < 2) return '';
  if (n < 4) {
    const [a, b] = [outline[0], outline[n - 1]];
    return `M${fmt(a[0])},${fmt(a[1])}L${fmt(b[0])},${fmt(b[1])}Z`;
  }
  let d = `M${fmt(outline[0][0])},${fmt(outline[0][1])}Q`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % n];
    d += `${fmt(x0)},${fmt(y0)} ${fmt((x0 + x1) / 2)},${fmt((y0 + y1) / 2)} `;
  }
  return `${d.trimEnd()}Z`;
}

/** The SVG path that draws a stroke. A single tap draws a dot. */
export const strokePath = (stroke: InkStroke, complete = true): string => outlinePath(strokeOutline(stroke, complete));

/** The smallest box around a stroke, its width included. */
export function strokeBounds(stroke: InkStroke): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < stroke.points.length; i += 3) {
    const x = stroke.points[i];
    const y = stroke.points[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const r = stroke.width / 2;
  return { x: minX - r, y: minY - r, w: maxX - minX + 2 * r, h: maxY - minY + 2 * r };
}

/** The box around several strokes, or null for none. */
export function unionBounds(strokes: readonly InkStroke[]): Box | null {
  if (!strokes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    const b = strokeBounds(s);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Squared distance from p to the segment a-b. */
function segmentDistance2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

/** Whether a circle of radius `r` at x, y touches the stroke. */
export function touches(stroke: InkStroke, x: number, y: number, r: number): boolean {
  const b = strokeBounds(stroke);
  if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) return false;
  const reach = r + stroke.width / 2;
  const reach2 = reach * reach;
  const p = stroke.points;
  if (p.length < 6) return (p[0] - x) ** 2 + (p[1] - y) ** 2 <= reach2;
  for (let i = 0; i + 5 < p.length; i += 3) {
    if (segmentDistance2(x, y, p[i], p[i + 1], p[i + 3], p[i + 4]) <= reach2) return true;
  }
  return false;
}

/**
 * The partial eraser: the stroke without the points a circle of radius `r` at x, y covers. Answers the stroke
 * itself when nothing is touched, else the pieces left (none when it is all erased). Pieces get new ids.
 */
export function eraseFrom(stroke: InkStroke, x: number, y: number, r: number): InkStroke[] {
  if (!touches(stroke, x, y, r)) return [stroke];
  const reach = r + stroke.width / 4;
  const reach2 = reach * reach;
  const pieces: number[][] = [];
  let current: number[] = [];
  const p = stroke.points;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const inside = (p[i] - x) ** 2 + (p[i + 1] - y) ** 2 <= reach2;
    if (inside) {
      if (current.length) pieces.push(current);
      current = [];
    } else {
      current.push(p[i], p[i + 1], p[i + 2]);
    }
  }
  if (current.length) pieces.push(current);
  // A segment can pass through the circle with both ends outside it: split it there too.
  const out: number[][] = [];
  for (const piece of pieces) {
    let run: number[] = [];
    for (let i = 0; i + 2 < piece.length; i += 3) {
      if (run.length >= 3) {
        const n = run.length;
        if (segmentDistance2(x, y, run[n - 3], run[n - 2], piece[i], piece[i + 1]) <= reach2) {
          out.push(run);
          run = [];
        }
      }
      run.push(piece[i], piece[i + 1], piece[i + 2]);
    }
    if (run.length) out.push(run);
  }
  if (out.length === 1 && out[0].length === p.length) return [stroke];
  return out.map((points) => ({ ...stroke, id: strokeId(), points }));
}

/** Whether a point is inside a polygon (even-odd rule). */
export function inPolygon(x: number, y: number, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The strokes a lasso holds: at least half of their points inside it. */
export function lassoed(strokes: readonly InkStroke[], polygon: readonly Point[]): InkStroke[] {
  if (polygon.length < 3) return [];
  return strokes.filter((s) => {
    const n = pointCount(s);
    let inside = 0;
    for (let i = 0; i + 1 < s.points.length; i += 3) if (inPolygon(s.points[i], s.points[i + 1], polygon)) inside++;
    return n > 0 && inside * 2 >= n;
  });
}

/** The stroke moved by dx, dy. */
export function moved(stroke: InkStroke, dx: number, dy: number): InkStroke {
  const points = stroke.points.slice();
  for (let i = 0; i + 1 < points.length; i += 3) {
    points[i] = round(points[i] + dx);
    points[i + 1] = round(points[i + 1] + dy);
  }
  return { ...stroke, points };
}
