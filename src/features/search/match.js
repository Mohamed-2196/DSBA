// Matching and ranking for the command palette. Pure functions, no dependencies.

/** Lower-case query tokens ('  Past  papers ' → ['past', 'papers']). */
export function tokenize(query) {
  return String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const isWordStart = (s, i) => i === 0 || /[^a-z0-9]/i.test(s[i - 1]) || (/[0-9]/.test(s[i]) && /[a-z]/i.test(s[i - 1]));

const isDigit = (c) => c >= '0' && c <= '9';
/** A lone digit only matches a whole number ('3' matches 'Year 3', not '37 lessons'). */
const digitOk = (s, i, token) => token.length !== 1 || !isDigit(token) || !isDigit(s[i + 1] || '');

/** Best position of `token` in `text`: { index, kind: 'start'|'word'|'inside' } or null. Single letters only match word starts. */
function find(text, token) {
  const s = text.toLowerCase();
  let i = s.indexOf(token);
  let inside = null;
  while (i >= 0) {
    if (!digitOk(s, i, token)) {
      i = s.indexOf(token, i + 1);
      continue;
    }
    if (i === 0) return { index: 0, kind: 'start' };
    if (isWordStart(s, i)) return { index: i, kind: 'word' };
    if (inside === null) inside = i;
    i = s.indexOf(token, i + 1);
  }
  if (inside !== null && token.length > 1) return { index: inside, kind: 'inside' };
  return null;
}

const TITLE = { start: 100, word: 72, inside: 38 };
const CODE = { start: 110, word: 90, inside: 40 };
const SUB = { start: 30, word: 26, inside: 12 };
const KEY = { start: 22, word: 20, inside: 9 };

/**
 * Score an entry against tokens. Every token must match somewhere (title, code, subtitle or
 * keywords) or the entry is out (returns 0).
 * entry: { title, code?, aliases?: string[], subtitle?, keywords?: string[], boost?: number }
 */
export function scoreEntry(entry, tokens, rawQuery) {
  if (!tokens.length) return 0;
  let score = 0;
  let titleHit = false;
  const title = entry.title || '';
  for (const t of tokens) {
    let best = 0;
    const inTitle = find(title, t);
    if (inTitle) {
      best = TITLE[inTitle.kind];
      titleHit = true;
    }
    // Other names for the same thing ("Maths", "stats", "ML") count almost like the title.
    if (entry.aliases && best < TITLE.start) {
      for (const al of entry.aliases) {
        if (!al) continue;
        const f = find(al, t);
        if (f) best = Math.max(best, TITLE[f.kind] - 6);
      }
    }
    if (entry.code) {
      const c = find(entry.code, t);
      if (c) best = Math.max(best, entry.code.toLowerCase() === t ? 130 : CODE[c.kind]);
    }
    if (best < SUB.start && entry.subtitle) {
      const sub = find(entry.subtitle, t);
      if (sub) best = Math.max(best, SUB[sub.kind]);
    }
    if (best < KEY.start && entry.keywords) {
      for (const k of entry.keywords) {
        if (!k) continue;
        const kw = find(k, t);
        if (kw) best = Math.max(best, KEY[kw.kind]);
      }
    }
    if (!best) return 0;
    score += best;
  }
  // The whole phrase in the title beats scattered words; among title matches, shorter titles
  // win ties (keyword-only matches keep their natural order, e.g. chapter order).
  const phrase = String(rawQuery || '').toLowerCase().trim();
  if (tokens.length > 1 && title.toLowerCase().includes(phrase)) score += 40;
  if (title.toLowerCase() === phrase) score += 60;
  if (titleHit) score -= Math.min(20, title.length / 8);
  return score + (entry.boost || 0);
}

/** Highlight ranges [[start, end), …] for every token occurrence in `text` (merged). */
export function matchRanges(text, tokens) {
  if (!text || !tokens.length) return [];
  const s = text.toLowerCase();
  const ranges = [];
  for (const t of tokens) {
    let i = s.indexOf(t);
    while (i >= 0) {
      if ((t.length > 1 || isWordStart(s, i)) && digitOk(s, i, t)) ranges.push([i, i + t.length]);
      i = s.indexOf(t, i + 1);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
