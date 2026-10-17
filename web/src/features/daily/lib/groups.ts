// Correlations: keeping the player's order of the board, sizing long words, and each try's colours.
import type { FoundGroup } from '../types';

/**
 * The words left on the board in the player's order: words they've arranged keep their places, words that left the
 * board drop out, and any word not placed yet goes at the end in the server's order.
 */
export function keepOrder(order: readonly string[] | null, words: readonly string[]): string[] {
  if (!order) return [...words];
  const left = new Set(words);
  const kept = order.filter((w) => left.has(w));
  const seen = new Set(kept);
  return [...kept, ...words.filter((w) => !seen.has(w))];
}

/** A random order of the words (Fisher-Yates), with `random` in [0, 1). */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** The type size for a word on a tile: long words get smaller type so they fit on a phone. */
export function wordFit(word: string): 'md' | 'sm' | 'xs' {
  if (word.length >= 10) return 'xs';
  if (word.length >= 8) return 'sm';
  return 'md';
}

/** Each try's words as the levels of their groups (1-4), lowest first: the result grid. Needs every group. */
export function tryLevels(guesses: readonly (readonly string[])[], groups: readonly FoundGroup[]): number[][] {
  const level = new Map<string, number>();
  for (const g of groups) for (const w of g.words) level.set(w, g.level);
  return guesses.map((words) => words.map((w) => level.get(w) ?? 0).sort((a, b) => a - b));
}

export const MAX_MISTAKES = 4;
