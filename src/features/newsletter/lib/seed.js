// Seeded PRNG for the generated cover art (deterministic: same seed, same picture, every render).

/** mulberry32: a tiny, fast 32-bit PRNG. Returns () => float in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round to 1 decimal for compact SVG path strings. */
export const r1 = (n) => Math.round(n * 10) / 10;
