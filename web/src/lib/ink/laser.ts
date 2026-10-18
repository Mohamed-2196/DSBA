// The laser pointer: a bright trail that follows the pen and fades within a second. It is drawn for whoever is
// looking at the screen (reading a paper out, explaining a step) and never saved.
export interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

/** How long a point of the trail stays visible, in ms. */
export const LASER_FADE = 900;

/** The trail without the points that have faded. */
export const liveTrail = (trail: readonly LaserPoint[], now: number): LaserPoint[] =>
  trail.filter((p) => now - p.t < LASER_FADE);

/** The trail as segments, each with how visible it still is (1 new, 0 gone). A gap (a new touch) breaks it. */
export function laserSegments(
  trail: readonly LaserPoint[],
  now: number,
): { x1: number; y1: number; x2: number; y2: number; alpha: number }[] {
  const out = [];
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    if (b.t - a.t > 120) continue;
    const alpha = Math.max(0, 1 - (now - b.t) / LASER_FADE);
    if (alpha > 0) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, alpha });
  }
  return out;
}
