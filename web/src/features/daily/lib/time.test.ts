import { describe, expect, it } from 'vitest';
import { formatCountdown, formatDuration } from './time';
import { withLink } from './share';

describe('formatCountdown', () => {
  const now = Date.UTC(2026, 9, 17, 18, 0, 0);

  it('counts down in hours, minutes and seconds', () => {
    expect(formatCountdown(new Date(now + (2 * 3600 + 30 * 60 + 15) * 1000).toISOString(), now)).toBe('02:30:15');
  });

  it('stops at zero', () => {
    expect(formatCountdown(new Date(now - 5000).toISOString(), now)).toBe('00:00:00');
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
