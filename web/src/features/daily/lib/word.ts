// The Word: the keyboard's colours and what a finished play is called.
import type { WordMark, WordRow } from '../types';

export const KEY_ROWS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Enter', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'],
];

const RANK: Record<WordMark, number> = { miss: 0, near: 1, hit: 2 };

/** Each letter guessed so far with the best it has shown: in the right spot beats elsewhere, which beats absent. */
export function keyMarks(rows: readonly WordRow[]): Record<string, WordMark> {
  const marks: Record<string, WordMark> = {};
  for (const row of rows) {
    [...row.word.toUpperCase()].forEach((letter, i) => {
      const mark = row.marks[i];
      if (!mark) return;
      const was = marks[letter];
      if (was === undefined || RANK[mark] > RANK[was]) marks[letter] = mark;
    });
  }
  return marks;
}

const PRAISE = ['In one!', 'Brilliant', 'Impressive', 'Nicely done', 'Good work', 'Phew'] as const;

/** The headline for a solved word, by the guess that found it (1-6). */
export function praise(guesses: number): string {
  return PRAISE[Math.min(Math.max(guesses, 1), PRAISE.length) - 1] ?? 'Solved';
}

export const MARK_LABEL: Record<WordMark, string> = {
  hit: 'in the word, in this spot',
  near: 'in the word, in another spot',
  miss: 'not in the word',
};
