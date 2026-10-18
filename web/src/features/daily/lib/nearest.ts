// Nearest Neighbour: how a rank reads. Rank 1 is the secret word; the bands match the share text's colours.
import type { NearestGuess } from '../types';

export type Band = 'found' | 'close' | 'warm' | 'cold';

export const CLOSE = 50;
export const WARM = 200;

export function band(rank: number): Band {
  if (rank === 1) return 'found';
  if (rank <= CLOSE) return 'close';
  if (rank <= WARM) return 'warm';
  return 'cold';
}

export const BAND_LABEL: Record<Band, string> = { found: 'Secret word', close: 'Close', warm: 'Warm', cold: 'Cold' };

/** How close a rank is on a 0-1 scale that spreads out the near end: 1 for the secret word, 0 for the farthest. */
export function closeness(rank: number, vocabulary: number): number {
  if (rank <= 1) return 1;
  if (vocabulary <= 1) return 0;
  return Math.max(0, Math.min(1, 1 - Math.log(rank) / Math.log(vocabulary)));
}

/** The guesses closest first; on a tie, the earlier guess first. */
export function byCloseness(guesses: readonly NearestGuess[]): NearestGuess[] {
  return guesses
    .map((g, i) => ({ g, i }))
    .sort((a, b) => a.g.rank - b.g.rank || a.i - b.i)
    .map(({ g }) => g);
}

/** The best rank so far, or null before the first guess. */
export const bestRank = (guesses: readonly NearestGuess[]): number | null =>
  guesses.length ? Math.min(...guesses.map((g) => g.rank)) : null;
