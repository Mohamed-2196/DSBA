import { describe, expect, it } from 'vitest';
import { greetingFor, greetingLede, lumenPose, numberWord } from './time';

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

describe('greetingLede', () => {
  it('counts down to the next exam', () => {
    expect(greetingLede({ days: 3, name: 'ST2134' }, null)).toBe('Your ST2134 exam is in 3 days.');
    expect(greetingLede({ days: 1, name: 'ST2134' }, null)).toBe('Your ST2134 exam is tomorrow.');
    expect(greetingLede({ days: 0, name: 'ST2134' }, null)).toBe('Your ST2134 exam is today. Good luck.');
  });

  it('mentions a paper still being timed, and says nothing when there is nothing to say', () => {
    expect(greetingLede(null, 'ST2134 · May 2025')).toBe('Your ST2134 · May 2025 timer is still running.');
    expect(greetingLede({ days: 4, name: 'EC2020' }, 'EC2020 · May 2024')).toBe(
      'Your EC2020 exam is in 4 days. Your EC2020 · May 2024 timer is still running.',
    );
    expect(greetingLede(null, null)).toBeNull();
  });
});
