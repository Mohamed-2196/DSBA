// Matching for the command palette: query tokens, the highlight ranges in a result, and the score of the
// palette's own entries (actions and pages). Content results come ranked from the API. Pure functions.

/** Lower-case query tokens ('  Past  papers ' → ['past', 'papers']). */
export function tokenize(query: string): string[] {
  return String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const isWordStart = (s: string, i: number): boolean => i === 0 || /[^a-z0-9]/i.test(s[i - 1] ?? '') || (/[0-9]/.test(s[i] ?? '') && /[a-z]/i.test(s[i - 1] ?? ''));

const isDigit = (c: string): boolean => c >= '0' && c <= '9';
/** A lone digit only matches a whole number ('3' matches 'Year 3', not '37 lessons'). */
const digitOk = (s: string, i: number, token: string): boolean => token.length !== 1 || !isDigit(token) || !isDigit(s[i + 1] ?? '');

type MatchKind = 'start' | 'word' | 'inside';

/** Best position of `token` in `text`. Single letters only match word starts. */
function find(text: string, token: string): { index: number; kind: MatchKind } | null {
  const s = text.toLowerCase();
  let i = s.indexOf(token);
  let inside: number | null = null;
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

const TITLE: Record<MatchKind, number> = { start: 100, word: 72, inside: 38 };
const KEY: Record<MatchKind, number> = { start: 22, word: 20, inside: 9 };

export interface Scorable {
  title: string;
  keywords?: readonly (string | null | undefined)[];
}

/** Score an entry against tokens. Every token must match the title or a keyword, or the entry is out (0). */
export function scoreEntry(entry: Scorable, tokens: readonly string[], rawQuery: string): number {
  if (!tokens.length) return 0;
  let score = 0;
  const title = entry.title || '';
  for (const t of tokens) {
    let best = 0;
    const inTitle = find(title, t);
    if (inTitle) best = TITLE[inTitle.kind];
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
  const phrase = String(rawQuery || '').toLowerCase().trim();
  if (tokens.length > 1 && title.toLowerCase().includes(phrase)) score += 40;
  if (title.toLowerCase() === phrase) score += 60;
  return score;
}

/** Highlight ranges [[start, end), …] for every token occurrence in `text` (merged). */
export function matchRanges(text: string, tokens: readonly string[]): [number, number][] {
  if (!text || !tokens.length) return [];
  const s = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const t of tokens) {
    let i = s.indexOf(t);
    while (i >= 0) {
      if ((t.length > 1 || isWordStart(s, i)) && digitOk(s, i, t)) ranges.push([i, i + t.length]);
      i = s.indexOf(t, i + 1);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
