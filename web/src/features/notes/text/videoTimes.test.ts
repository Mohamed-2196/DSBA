import { describe, expect, it } from 'vitest';
import { VIDEO_TIME_MAX, clockLabel, lessonAt, lessonVideoStart } from './videoTimes';

describe('times in a lesson video', () => {
  it('read like a clock', () => {
    expect(clockLabel(0)).toBe('0:00');
    expect(clockLabel(245.9)).toBe('4:05');
    expect(clockLabel(3725)).toBe('1:02:05');
  });

  it('open the lesson there, and are read back from its address', () => {
    expect(lessonAt('st2133', 'abc', 245.6)).toMatch(/\?t=245$/);
    expect(lessonVideoStart('?t=245')).toBe(245);
    expect(lessonVideoStart('?t=0')).toBeNull();
    expect(lessonVideoStart('?t=nope')).toBeNull();
    expect(lessonVideoStart('')).toBeNull();
    expect(lessonVideoStart(`?t=${VIDEO_TIME_MAX + 50}`)).toBe(VIDEO_TIME_MAX);
  });
});
