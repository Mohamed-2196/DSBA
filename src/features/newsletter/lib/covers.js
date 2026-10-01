// Geometry for the generated issue covers (SVG, viewBox 300 × 400). Every cover is a chart of its
// issue: the pilot is a small-sample scatter on graph paper, the launch is the pulse on ECG paper,
// an upcoming issue is a forecast with a fan of uncertainty. Seeded, so identical on every render.
import { mulberry32, r1 } from './seed.js';

export const COVER_W = 300;
export const COVER_H = 400;

/** One path drawing a grid of vertical + horizontal lines every `step` units inside a box. */
export function gridPath({ x0 = 0, y0 = 0, x1 = COVER_W, y1 = COVER_H, step }) {
  let d = '';
  for (let x = x0 + step; x < x1; x += step) d += `M${x} ${y0}V${y1}`;
  for (let y = y0 + step; y < y1; y += step) d += `M${x0} ${y}H${x1}`;
  return d;
}

// ── Launch: the brand pulse trace (ui/PulseMark PULSE_PATH), enlarged onto ECG paper ─────────
// Brand path in its own 48×24 box (baseline y = 15). Mapped with X = 18 + (x − 2)·6, Y = 228 + (y − 15)·11.
const BRAND_POINTS = [
  [8.5, 15], [11, 12.6], [13.5, 15.8], [16.2, 14.4], [19.6, 3.4], [23.6, 20.6], [26.6, 12.4],
  [29.6, 15.4], [33.2, 13.6], [37, 15], [40.6, 12.9], [44.6, 12.9],
];
const LX = (x) => r1(18 + (x - 2) * 6);
const LY = (y) => r1(228 + (y - 15) * 11);
export const LAUNCH_TRACE = `M-6 228H${LX(8.5)}${BRAND_POINTS.slice(1).map(([x, y]) => `L${LX(x)} ${LY(y)}`).join('')}`;
export const LAUNCH_DOT = { cx: LX(44.6), cy: LY(12.9) };

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

// ── Forecast: observed series to "now", then a fan chart ───────────────────
export const FORECAST = (() => {
  const rand = mulberry32(13102026);
  const nowX = 150;
  const obs = [];
  let y = 246;
  for (let x = 24; x <= nowX; x += 9) {
    y += (rand() - 0.58) * 16;
    y = Math.max(214, Math.min(262, y));
    obs.push([x, r1(y)]);
  }
  obs[obs.length - 1] = [nowX, obs[obs.length - 1][1]];
  const startY = obs[obs.length - 1][1];
  const endX = 276;
  const endY = startY - 54; // trending up
  const mid = (t) => r1(startY + (endY - startY) * t);
  const steps = 14;
  const band = (k) => {
    const top = [];
    const bot = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = r1(nowX + (endX - nowX) * t);
      const w = k * Math.sqrt(t) * 58;
      top.push(`${x} ${r1(mid(t) - w)}`);
      bot.unshift(`${x} ${r1(mid(t) + w)}`);
    }
    return `M${top.join('L')}L${bot.join('L')}Z`;
  };
  return {
    nowX,
    observed: `M${obs.map((p) => p.join(' ')).join('L')}`,
    forecast: `M${nowX} ${startY}L${endX} ${endY}`,
    outer: band(1),
    inner: band(0.5),
    end: { x: endX, y: endY },
  };
})();
