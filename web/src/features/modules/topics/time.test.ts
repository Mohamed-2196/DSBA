import { describe, expect, it } from 'vitest';
import { clockLabel, coversLine, parseClock, playbackTime } from './time';

describe('clockLabel', () => {
  it('writes minutes and seconds, and hours past the hour', () => {
    expect(clockLabel(0)).toBe('0:00');
    expect(clockLabel(760)).toBe('12:40');
    expect(clockLabel(3725)).toBe('1:02:05');
  });
});

describe('parseClock', () => {
  it('reads what students write', () => {
    expect(parseClock('12:40')).toBe(760);
    expect(parseClock(' 1:02:05 ')).toBe(3725);
    expect(parseClock('41')).toBe(2460);
    expect(parseClock('90:00')).toBe(5400);
  });
  it('refuses what isn’t a time', () => {
    expect(parseClock('')).toBeNull();
    expect(parseClock('12:4')).toBeNull();
    expect(parseClock('12:61')).toBeNull();
    expect(parseClock('1:61:00')).toBeNull();
    expect(parseClock('ten')).toBeNull();
    expect(parseClock('24:00:00')).toBeNull();
  });
});

describe('playbackTime', () => {
  it('writes BigBlueButton’s start time', () => {
    expect(playbackTime(5)).toBe('5s');
    expect(playbackTime(760)).toBe('12m40s');
    expect(playbackTime(3725)).toBe('1h2m5s');
  });
});

describe('coversLine', () => {
  it('names the first topics', () => {
    expect(coversLine([])).toBeNull();
    expect(coversLine(['MLE'])).toBe('Covers: MLE');
    expect(coversLine(['MLE', 'Invariance', 'Bias', 'CRLB'])).toBe('Covers: MLE, Invariance and 2 more');
  });
});
