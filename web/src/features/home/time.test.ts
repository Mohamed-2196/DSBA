import { describe, expect, it } from 'vitest';
import { greetingFor, lumenPose, numberWord } from './time';

const at = (h: number) => new Date(2026, 9, 20, h, 30);

describe('greetingFor', () => {
  it('follows the hour', () => {
    expect(greetingFor(at(8))).toBe('Good morning');
    expect(greetingFor(at(13))).toBe('Good afternoon');
    expect(greetingFor(at(21))).toBe('Good evening');
  });
});

describe('lumenPose', () => {
  it('waves on the first Home of a visit, then rests', () => {
    expect(lumenPose(at(10), true, false)).toBe('wave');
    expect(lumenPose(at(10), true, true)).toBe('idle');
  });
  it('sleeps late at night and offline', () => {
    expect(lumenPose(at(23), true, false)).toBe('sleepy');
    expect(lumenPose(at(2), true, true)).toBe('sleepy');
    expect(lumenPose(at(10), false, false)).toBe('sleepy');
  });
});

describe('numberWord', () => {
  it('spells small numbers', () => {
    expect(numberWord(6)).toBe('six');
    expect(numberWord(12)).toBe('12');
  });
});
