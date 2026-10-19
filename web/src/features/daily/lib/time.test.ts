import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimeLeft } from './time';
import { withLink } from './share';

describe('formatTimeLeft', () => {
  const now = Date.UTC(2026, 9, 17, 18, 0, 0);
  const inSeconds = (s: number) => new Date(now + s * 1000).toISOString();

  it('counts down in hours and minutes, rounding up', () => {
    expect(formatTimeLeft(inSeconds(11 * 3600 + 50 * 60), now)).toBe('11 h 50 min');
    expect(formatTimeLeft(inSeconds(2 * 3600 + 30 * 60 + 15), now)).toBe('2 h 31 min');
    expect(formatTimeLeft(inSeconds(3 * 3600), now)).toBe('3 h');
    expect(formatTimeLeft(inSeconds(50 * 60), now)).toBe('50 min');
  });

  it('says a minute until the end', () => {
    expect(formatTimeLeft(inSeconds(20), now)).toBe('1 min');
    expect(formatTimeLeft(inSeconds(-5), now)).toBe('1 min');
  });
});

describe('formatDuration', () => {
  it('reads like a stopwatch', () => {
    expect(formatDuration(42)).toBe('0:42');
    expect(formatDuration(725)).toBe('12:05');
    expect(formatDuration(3723)).toBe('1:02:03');
  });
});

describe('withLink', () => {
  it('puts the address under the result', () => {
    expect(withLink('DSBA Daily #17\nThe Word 3/6\n', 'https://hub.example/daily')).toBe(
      'DSBA Daily #17\nThe Word 3/6\nhttps://hub.example/daily',
    );
  });
});
