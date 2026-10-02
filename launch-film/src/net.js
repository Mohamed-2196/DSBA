// The cohort network: ~160 student dots in three clusters (Year 1, 2, 3). Shared by Act 1 (the
// "three cohorts, finally connected" beat) and Act 3 (the same network comes back in gold), so the
// callback is exact. Pure and deterministic.
import { mulberry } from './lib.js';

export const COHORTS = [
  { c: [470, 520], n: 52, col: 'var(--y1)', hex: '#3bc9db', label: 'Year 1' },
  { c: [960, 320], n: 56, col: 'var(--y2)', hex: '#5e9bff', label: 'Year 2' },
  { c: [1450, 520], n: 52, col: 'var(--y3)', hex: '#ffa94d', label: 'Year 3' },
];

/** 160 points: { x, y, g (cohort index), col, hex }. Same every call. */
export function cohortNodes() {
  const rnd = mulberry(2026);
  const pts = [];
  COHORTS.forEach((g, gi) => {
    for (let i = 0; i < g.n; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 190;
      pts.push({ x: g.c[0] + Math.cos(a) * r * 1.25, y: g.c[1] + Math.sin(a) * r * 0.8, g: gi, col: g.col, hex: g.hex });
    }
  });
  return pts;
}

/** `n` links [i, j] between students of DIFFERENT cohorts (indices into cohortNodes()). Same every call. */
export function crossLinks(pts, n = 72) {
  const rnd = mulberry(404);
  const out = [];
  let guard = 0;
  while (out.length < n && guard < 5000) {
    guard += 1;
    const i = Math.floor(rnd() * pts.length);
    const j = Math.floor(rnd() * pts.length);
    if (pts[i].g === pts[j].g) continue;
    out.push([i, j]);
  }
  return out;
}
