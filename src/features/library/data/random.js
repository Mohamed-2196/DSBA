// Seeded randomness for the mock library. Everything in the catalog and the mock pages is derived
// from stable string seeds, so the same file always renders the same pages (no Math.random()).

/** FNV-1a 32-bit hash of a string. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG → () => float in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A PRNG seeded from any number of string/number parts. */
export function rngFor(...parts) {
  return mulberry32(hashString(parts.join('|')));
}

export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
export const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

/** n distinct items from a list (stable for a given rng). */
export function pickMany(rng, list, n) {
  const pool = list.slice();
  const out = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

/** Item i of a list, cycling, offset by a seed so neighbouring files don't start on the same item. */
export function cycle(list, i, offset = 0) {
  if (!list.length) return undefined;
  return list[(((i + offset) % list.length) + list.length) % list.length];
}

/** Roughly normal sample (sum of uniforms), mean 0, sd ≈ 1. */
export function gauss(rng) {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rng();
  return (s - 3) / 0.7071;
}
