import { describe, expect, it } from 'vitest';
import { choosePose, heading, lean, motionFor } from './poses';

const rest = { carry: null, step: 0 as const, pressed: false, dropped: false, chat: null, lively: false };

describe('her pose', () => {
  it('is idle at rest and waves when the pointer is over her', () => {
    expect(choosePose(rest)).toBe('idle');
    expect(choosePose({ ...rest, lively: true })).toBe('talking');
    expect(motionFor({ chat: null, lively: true })).toBe('wave');
  });

  it('follows the chat: thinking, answering, done', () => {
    expect(choosePose({ ...rest, chat: 'thinking' })).toBe('surprised');
    expect(motionFor({ chat: 'thinking', lively: false })).toBe('think');
    expect(choosePose({ ...rest, chat: 'talking' })).toBe('talking');
    expect(choosePose({ ...rest, chat: 'happy', lively: true })).toBe('happy');
  });

  it('walks while she is carried sideways and shows her back going up', () => {
    expect(choosePose({ ...rest, carry: { dir: 'right', moving: true }, step: 1 })).toBe('walk-right');
    expect(choosePose({ ...rest, carry: { dir: 'left', moving: false }, step: 1 })).toBe('side-left');
    expect(choosePose({ ...rest, carry: { dir: 'up', moving: true } })).toBe('back');
  });

  it('what is done to her comes before the chat', () => {
    expect(choosePose({ ...rest, pressed: true, chat: 'talking' })).toBe('surprised');
    expect(choosePose({ ...rest, dropped: true, chat: 'sad' })).toBe('happy');
  });
});

describe('carrying her', () => {
  it('turns only when a direction is clearly the main one', () => {
    expect(heading(100, 10)).toBe('right');
    expect(heading(-5, -100)).toBe('up');
    expect(heading(10, 5, 'left')).toBe('left'); // too slow to turn
    expect(heading(100, -90, 'up')).toBe('up'); // not clearly sideways
  });

  it('leans into the carry, at most 9 degrees', () => {
    expect(lean(0)).toBe(0);
    expect(lean(5000)).toBe(9);
    expect(lean(-120)).toBe(-2);
  });
});
