// Calendar-only date helpers: the month grid.
import { describe, expect, it } from 'vitest';
import { monthMatrix, windowCountdown } from './dates';

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('monthMatrix', () => {
  it('covers the month in whole weeks, Sunday first', () => {
    // October 2026 starts on a Thursday and has 31 days: 4 + 31 = 35 cells, 5 weeks
    const weeks = monthMatrix({ y: 2026, m: 9 });
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(key(weeks[0]![0]!)).toBe('2026-09-27');
    expect(key(weeks[0]![4]!)).toBe('2026-10-01');
    expect(key(weeks[4]![6]!)).toBe('2026-10-31');
    expect(weeks.flat().every((d) => d.getDay() === weeks.flat().indexOf(d) % 7)).toBe(true);
  });

  it('takes six weeks when the month needs them', () => {
    // May 2026 starts on a Friday: 5 + 31 = 36 cells
    const weeks = monthMatrix({ y: 2026, m: 4 });
    expect(weeks).toHaveLength(6);
    expect(key(weeks[5]![6]!)).toBe('2026-06-06');
  });

  it('takes four weeks for a February that starts on a Sunday', () => {
    expect(monthMatrix({ y: 2026, m: 1 })).toHaveLength(4);
  });
});

describe('windowCountdown', () => {
  it('counts down to a date that has not started', () => {
    expect(windowCountdown(4, 10, '24 Oct')).toBe('4 days');
    expect(windowCountdown(0, null, '')).toBe('Today');
  });
  it('says a started window is open until its last day', () => {
    expect(windowCountdown(-1, 10, '24 Oct')).toBe('Open until 24 Oct');
    expect(windowCountdown(-5, 0, '24 Oct')).toBe('Ends today');
  });
  it('is past once the last day has gone, or with no last day', () => {
    expect(windowCountdown(-12, -1, '24 Oct')).toBe('Past');
    expect(windowCountdown(-1, null, '')).toBe('Past');
  });
});
