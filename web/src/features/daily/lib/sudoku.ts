// Sudoku's grid helpers: cells are 0-80 in reading order.
import type { Notes } from './storage';

export const rowOf = (cell: number): number => Math.floor(cell / 9);
export const colOf = (cell: number): number => cell % 9;
export const boxOf = (cell: number): number => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);

/** True when two different cells share a row, a column or a box. */
export const arePeers = (a: number, b: number): boolean =>
  a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));

/** The digit showing in each cell: a given, or one placed (or hinted); 0 when empty. */
export function digitsOf(givens: readonly number[], filled: readonly number[]): number[] {
  return givens.map((g, i) => g || filled[i] || 0);
}

/** How many of each digit are still to place (index 1-9; index 0 unused). */
export function leftToPlace(digits: readonly number[]): number[] {
  const left: number[] = Array.from({ length: 10 }, (_, d) => (d === 0 ? 0 : 9));
  for (const d of digits) if (d >= 1 && d <= 9) left[d] = Math.max(0, (left[d] ?? 0) - 1);
  return left;
}

/** The notes once `digit` is placed in `cell`: that cell's notes go, and the digit leaves its peers' notes. */
export function placeInNotes(notes: Notes, cell: number, digit: number): Notes {
  const next: Notes = {};
  for (const [key, digits] of Object.entries(notes)) {
    const i = Number(key);
    if (i === cell) continue;
    const kept = arePeers(i, cell) ? digits.filter((d) => d !== digit) : digits;
    if (kept.length) next[i] = kept;
  }
  return next;
}

/** A cell's notes with `digit` switched on or off. */
export function toggleNote(notes: Notes, cell: number, digit: number): Notes {
  const current = notes[cell] ?? [];
  const digits = current.includes(digit)
    ? current.filter((d) => d !== digit)
    : [...current, digit].sort((a, b) => a - b);
  const next = { ...notes };
  if (digits.length) next[cell] = digits;
  else delete next[cell];
  return next;
}

/** The cell an arrow key moves to (wrapping round the edges), or null for any other key. */
export function step(cell: number, key: string): number | null {
  const r = rowOf(cell);
  const c = colOf(cell);
  switch (key) {
    case 'ArrowUp':
      return ((r + 8) % 9) * 9 + c;
    case 'ArrowDown':
      return ((r + 1) % 9) * 9 + c;
    case 'ArrowLeft':
      return r * 9 + ((c + 8) % 9);
    case 'ArrowRight':
      return r * 9 + ((c + 1) % 9);
    default:
      return null;
  }
}

/** The first empty cell, to start from when nothing is picked. */
export const firstEmpty = (digits: readonly number[]): number => Math.max(0, digits.indexOf(0));
