// Geometry for the generated issue covers (SVG, viewBox 300 × 400). Every cover is a chart or a
// diagram of its issue: the pilot is a small-sample scatter on graph paper, the launch is the logo
// idea (three nodes joined at a hub) drawn large. Deterministic: identical on every render.
import { r1 } from './seed.js';

export const COVER_W = 300;
export const COVER_H = 400;

/** One path drawing a grid of vertical + horizontal lines every `step` units inside a box. */
export function gridPath({ x0 = 0, y0 = 0, x1 = COVER_W, y1 = COVER_H, step }) {
  let d = '';
  for (let x = x0 + step; x < x1; x += step) d += `M${x} ${y0}V${y1}`;
  for (let y = y0 + step; y < y1; y += step) d += `M${x0} ${y}H${x1}`;
  return d;
}

// ── Launch: three nodes joined at a hub (ui/HubMark's tile, without the tile) ──────
// In the logo the three nodes sit 9.1 units from the hub, at −90°, 30° and 150°. Here the same
// arrangement is enlarged: radius 78 around the hub, with two quiet rings behind it.
const HUB = { x: 150, y: 218 };
const RADIUS = 78;
const polar = (deg, r) => ({ x: r1(HUB.x + r * Math.cos((deg * Math.PI) / 180)), y: r1(HUB.y + r * Math.sin((deg * Math.PI) / 180)) });
export const LAUNCH = {
  hub: HUB,
  nodes: [-90, 30, 150].map((deg) => polar(deg, RADIUS)),
  rings: [RADIUS, 112],
};
LAUNCH.spokes = LAUNCH.nodes.map((n) => `M${HUB.x} ${HUB.y}L${n.x} ${n.y}`).join('');

// ── Pilot: n = 7, a least-squares line and its residuals ───────────────────
const PILOT_POINTS = [
  [70, 258], [96, 236], [121, 247], [149, 207], [176, 219], [205, 180], [236, 172],
];
function leastSquares(points) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  const sxy = points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const sxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}
const FIT = leastSquares(PILOT_POINTS);
const fitY = (x) => r1(FIT.a + FIT.b * x);
export const PILOT = {
  points: PILOT_POINTS,
  fit: { x1: 54, y1: fitY(54), x2: 256, y2: fitY(256) },
  residuals: PILOT_POINTS.map(([x, y]) => ({ x, y1: y, y2: fitY(x) })),
};
