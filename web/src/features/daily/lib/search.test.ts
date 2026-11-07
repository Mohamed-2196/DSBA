import { describe, expect, it } from 'vitest';
import { cellAt, dragTo, linePath, tapAt, touches, type Pos } from './search';

const p = (row: number, col: number): Pos => ({ row, col });
const free = () => true;

describe('touches', () => {
  it('takes letters next to each other, diagonals too, but not the same one', () => {
    expect(touches(p(2, 2), p(3, 3))).toBe(true);
    expect(touches(p(2, 2), p(2, 4))).toBe(false);
    expect(touches(p(2, 2), p(2, 2))).toBe(false);
  });
});

describe('cellAt', () => {
  it('finds the letter near its centre, and nothing between letters or off the board', () => {
    expect(cellAt(0.5 / 6, 0.5 / 8, 8, 6)).toEqual(p(0, 0));
    expect(cellAt(5.5 / 6, 7.5 / 8, 8, 6)).toEqual(p(7, 5));
    expect(cellAt(1 / 6, 1 / 8, 8, 6)).toBeNull(); // a corner between four letters
    expect(cellAt(1.2, 0.5, 8, 6)).toBeNull();
  });
});

describe('dragTo', () => {
  it('adds a touching free letter, goes back over the last one, and refuses the rest', () => {
    const path = [p(0, 0), p(0, 1)];
    expect(dragTo(path, p(1, 2), free)).toEqual([...path, p(1, 2)]);
    expect(dragTo(path, p(0, 0), free)).toEqual([p(0, 0)]); // back
    expect(dragTo(path, p(3, 3), free)).toEqual(path); // too far
    expect(dragTo(path, p(1, 1), () => false)).toEqual(path); // in a found word
  });
});

describe('tapAt', () => {
  it('starts, grows, cuts back, sends on the last letter, and starts again elsewhere', () => {
    expect(tapAt([], p(0, 0), free)).toEqual({ path: [p(0, 0)], send: false });
    expect(tapAt([p(0, 0)], p(1, 1), free)).toEqual({ path: [p(0, 0), p(1, 1)], send: false });
    expect(tapAt([p(0, 0), p(1, 1)], p(1, 1), free)).toEqual({ path: [p(0, 0), p(1, 1)], send: true });
    expect(tapAt([p(0, 0), p(1, 1), p(2, 2)], p(1, 1), free).path).toEqual([p(0, 0), p(1, 1)]);
    expect(tapAt([p(0, 0)], p(0, 0), free)).toEqual({ path: [], send: false }); // one letter, tapped again: cleared
    expect(tapAt([p(0, 0)], p(5, 5), free)).toEqual({ path: [p(5, 5)], send: false });
  });
});

describe('linePath', () => {
  it('draws through the letters’ centres', () => {
    expect(linePath([p(0, 0), p(1, 1)], 100)).toBe('M50 50 L150 150');
  });
});
