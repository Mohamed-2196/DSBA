import { describe, expect, it } from 'vitest';
import { arePeers, boxOf, digitsOf, leftToPlace, placeInNotes, step, toggleNote } from './sudoku';

describe('the grid', () => {
  it('knows rows, columns and boxes', () => {
    expect(boxOf(0)).toBe(0);
    expect(boxOf(40)).toBe(4);
    expect(boxOf(80)).toBe(8);
    expect(arePeers(0, 8)).toBe(true); // same row
    expect(arePeers(0, 72)).toBe(true); // same column
    expect(arePeers(0, 20)).toBe(true); // same box
    expect(arePeers(0, 40)).toBe(false);
    expect(arePeers(3, 3)).toBe(false);
  });

  it('moves with the arrows and wraps round', () => {
    expect(step(0, 'ArrowLeft')).toBe(8);
    expect(step(0, 'ArrowUp')).toBe(72);
    expect(step(80, 'ArrowRight')).toBe(72);
    expect(step(40, 'ArrowDown')).toBe(49);
    expect(step(40, 'Enter')).toBeNull();
  });
});

describe('digits', () => {
  it('counts what is left of each digit', () => {
    const givens = Array.from({ length: 81 }, (_, i) => (i < 9 ? i + 1 : 0));
    const filled = Array.from({ length: 81 }, (_, i) => (i === 9 ? 1 : 0));
    const left = leftToPlace(digitsOf(givens, filled));
    expect(left[1]).toBe(7);
    expect(left[9]).toBe(8);
  });
});

describe('notes', () => {
  it('toggles a digit in a cell', () => {
    const once = toggleNote({}, 10, 5);
    expect(once).toEqual({ 10: [5] });
    expect(toggleNote(toggleNote(once, 10, 2), 10, 5)).toEqual({ 10: [2] });
    expect(toggleNote(once, 10, 5)).toEqual({});
  });

  it('clears a placed digit from the cell and its peers only', () => {
    const notes = { 0: [1, 2], 1: [2, 3], 40: [2, 7], 9: [2] };
    expect(placeInNotes(notes, 0, 2)).toEqual({ 1: [3], 40: [2, 7] });
  });
});
