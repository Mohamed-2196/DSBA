import { describe, expect, it } from 'vitest';
import { settle, type Drag } from './sheet';

const drag = (over: Partial<Drag>): Drag => ({ from: 'half', dy: 0, vy: 0, height: 420, canHalf: true, ...over });

describe('settle', () => {
  it('stays where it was after a small drag', () => {
    expect(settle(drag({ dy: 30 }))).toBe('half');
    expect(settle(drag({ from: 'full', dy: -20, height: 780 }))).toBe('full');
  });

  it('goes a height lower when pulled down, and closes from half height', () => {
    expect(settle(drag({ from: 'full', dy: 140, height: 780 }))).toBe('half');
    expect(settle(drag({ dy: 140 }))).toBe('closed');
  });

  it('closes from full height when pulled most of the way down or when there is no half height', () => {
    expect(settle(drag({ from: 'full', dy: 520, height: 780 }))).toBe('closed');
    expect(settle(drag({ from: 'full', dy: 140, height: 360, canHalf: false }))).toBe('closed');
  });

  it('follows a flick', () => {
    expect(settle(drag({ dy: 12, vy: 0.9 }))).toBe('closed');
    expect(settle(drag({ dy: -12, vy: -0.9 }))).toBe('full');
  });

  it('goes to full height when pulled up', () => {
    expect(settle(drag({ dy: -100 }))).toBe('full');
  });
});
