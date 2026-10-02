// 17 stacked traces (a ridgeline, after the famous pulsar plot): one line per tutor.
// Seeded, so every render (and every tutor's card) gets the same line.
import { mulberry32, r1 } from '../lib/seed.js';

/**
 * @returns {{ width, height, lines: { d: string, fill: string, base: number }[] }}
 *   d: the trace path; fill: the occlusion shape under it (drawn in the ground colour, back to front).
 */
export function makeRidgelines({ count = 17, width = 1000, top = 150, gap = 21, seed = 61017 } = {}) {
  const height = top + (count - 1) * gap + 40;
  const lines = [];
  for (let i = 0; i < count; i++) {
    const rand = mulberry32(seed + i * 7919);
    const base = top + i * gap;
    const mid = width / 2;
    const spread = width * 0.15;
    const spikeX = mid + (rand() - 0.5) * width * 0.22;
    const spikeH = 52 + rand() * 70;
    const bumps = Array.from({ length: 5 }, () => ({ x: mid + (rand() - 0.5) * width * 0.42, h: 5 + rand() * 20, w: 10 + rand() * 26 }));
    const tWave = { x: spikeX + 34 + rand() * 18, h: 7 + rand() * 9, w: 9 };

    const yAt = (x) => {
      const env = Math.exp(-((x - mid) ** 2) / (2 * spread ** 2));
      let y = 0;
      for (const b of bumps) y -= b.h * env * Math.exp(-((x - b.x) ** 2) / (2 * b.w ** 2));
      y -= tWave.h * Math.exp(-((x - tWave.x) ** 2) / (2 * tWave.w ** 2));
      return y;
    };

    const pts = [];
    for (let x = 0; x <= width + 6; x += 6) {
      if (x > spikeX - 18 && x < spikeX + 20) continue; // the spike is drawn with exact vertices
      const env = Math.exp(-((x - mid) ** 2) / (2 * (spread * 1.5) ** 2));
      pts.push([x, base + yAt(x) + (rand() - 0.5) * (0.8 + 3.2 * env)]);
    }
    const spike = [
      [spikeX - 18, base + yAt(spikeX - 18)],
      [spikeX - 9, base + 6],
      [spikeX, base - spikeH],
      [spikeX + 9, base + spikeH * 0.28],
      [spikeX + 20, base + yAt(spikeX + 20)],
    ];
    const all = [...pts.filter(([x]) => x < spikeX - 18), ...spike, ...pts.filter(([x]) => x > spikeX + 20)];
    const d = `M${all.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}`;
    // The occlusion shape runs past the viewBox on every side, so its edges are clipped, not drawn.
    lines.push({ d, fill: `${d}L${width + 24} ${base}L${width + 24} ${height + 24}L-24 ${height + 24}L-24 ${base}Z`, base, spikeH });
  }
  return { width, height, lines };
}

let cached = null;
/** The default ridgeline (computed once). */
export function getRidgelines() {
  if (!cached) cached = makeRidgelines();
  return cached;
}

/** One tutor's line on its own, cropped to the eventful middle (for a card). */
export function cardLine(index) {
  const { width, lines } = getRidgelines();
  const line = lines[index % lines.length];
  return { d: line.d, viewBox: `${width * 0.2} ${line.base - 132} ${width * 0.6} 172` };
}
