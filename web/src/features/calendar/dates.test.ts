// Calendar-only date helpers: the month grid, the days between two dates and the gap labels.
import { describe, expect, it } from 'vitest';
import { breakdownLabel, daysBreakdown, gapLabel, monthMatrix } from './dates';

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

describe('daysBreakdown', () => {
  it('splits the days the Bahraini way: Friday and Saturday are the weekend', () => {
    const b = daysBreakdown(new Date(2026, 9, 6), new Date(2026, 9, 23));
    expect(b).toEqual({ days: 17, weekdays: 13, weekendDays: 4, weekends: 2 });
    expect(breakdownLabel(b)).toBe('13 weekdays and 2 weekends');
  });

  it('counts a weekend cut in half in days', () => {
    // Saturday 10 October to Thursday 15 October: the Saturday alone, then Sunday to Wednesday
    const b = daysBreakdown(new Date(2026, 9, 10), new Date(2026, 9, 15));
    expect(b).toEqual({ days: 5, weekdays: 4, weekendDays: 1, weekends: 0 });
    expect(breakdownLabel(b)).toBe('4 weekdays and 1 weekend day');
  });

  it('is empty when the end is not after the start', () => {
    expect(daysBreakdown(new Date(2026, 9, 15), new Date(2026, 9, 10))).toEqual({ days: 0, weekdays: 0, weekendDays: 0, weekends: 0 });
    expect(breakdownLabel({ days: 1, weekdays: 1, weekendDays: 0, weekends: 0 })).toBeNull();
  });
});

describe('gapLabel', () => {
  it('names the gap between two dates', () => {
    expect(gapLabel(0)).toBe('Same day');
    expect(gapLabel(-2)).toBe('Same day');
    expect(gapLabel(1)).toBe('Next day');
    expect(gapLabel(1, { exams: true })).toBe('Back to back');
    expect(gapLabel(4, { exams: true })).toBe('4 days later');
  });
});
