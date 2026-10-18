import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  addDaysToKey,
  daysBetween,
  daysUntil,
  dayKey,
  formatClock,
  formatDay,
  formatDayMonth,
  formatLong,
  formatLongDay,
  formatMonthYear,
  formatShort,
  formatShortYear,
  inDays,
  isDayKey,
  isWeekend,
  monthShort,
  parseDay,
  relativeDays,
  startOfDay,
  today,
  todayKey,
} from './dates';

describe('todayKey', () => {
  it('is the day in Bahrain, whatever zone the device is in', () => {
    // 00:30 on 12 October in Manama is still 11 October in UTC.
    expect(todayKey(Date.parse('2026-10-11T21:30:00Z'))).toBe('2026-10-12');
    expect(todayKey(Date.parse('2026-10-11T20:59:59Z'))).toBe('2026-10-11');
    expect(todayKey(Date.parse('2026-10-12T20:59:00Z'))).toBe('2026-10-12');
    expect(todayKey(new Date('2026-12-31T21:00:00Z'))).toBe('2027-01-01');
  });

  it('gives today as a local midnight', () => {
    const d = today(Date.parse('2026-10-11T21:30:00Z'));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 12, 0]);
  });
});

describe('day keys', () => {
  it('reads and writes YYYY-MM-DD as a local day', () => {
    const d = parseDay('2026-10-23');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 23, 0]);
    expect(dayKey(d)).toBe('2026-10-23');
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('reads a malformed key as a harmless date instead of throwing', () => {
    expect(dayKey(parseDay('not a day'))).toBe('1970-01-01');
  });

  it('knows a real calendar day', () => {
    expect(isDayKey('2026-02-28')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-2-3')).toBe(false);
    expect(isDayKey('2026-10-23T00:00:00Z')).toBe(false);
    expect(isDayKey(20261023)).toBe(false);
  });

  it('adds days across months and years', () => {
    expect(addDaysToKey('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayKey(addDays(parseDay('2026-10-06'), 17))).toBe('2026-10-23');
  });

  it('starts a day at local midnight', () => {
    expect(startOfDay(new Date(2026, 9, 23, 17, 45)).getHours()).toBe(0);
    expect(dayKey(startOfDay('2026-10-23'))).toBe('2026-10-23');
  });
});

describe('daysBetween', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('counts calendar days, from the first to the second', () => {
    expect(daysBetween('2026-10-06', '2026-10-23')).toBe(17);
    expect(daysBetween('2026-10-23', '2026-10-06')).toBe(-17);
    expect(daysBetween(parseDay('2026-10-23'), new Date(2026, 9, 23, 23, 30))).toBe(0);
    expect(daysUntil('2026-10-24', '2026-10-23')).toBe(1);
  });

  it('is not thrown off by a daylight-saving change on the device', () => {
    vi.stubEnv('TZ', 'Europe/London'); // clocks go forward on 29 March 2026
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween(parseDay('2026-03-29'), parseDay('2026-03-30'))).toBe(1);
    vi.stubEnv('TZ', 'America/New_York'); // and back on 1 November 2026
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('words for days', () => {
  it('says how far a day is', () => {
    expect([0, 1, 17, -3].map(inDays)).toEqual(['today', 'tomorrow', 'in 17 days', 'today']);
    expect([0, 1, -1, 13, -3].map(relativeDays)).toEqual([
      'today',
      'tomorrow',
      'yesterday',
      'in 13 days',
      '3 days ago',
    ]);
  });

  it('writes dates in the British order, without commas or "Sept"', () => {
    const d = parseDay('2026-09-25');
    expect(monthShort(8)).toBe('Sep');
    expect(formatDay(d)).toBe('25 September 2026');
    expect(formatDay(d, { month: 'short' })).toBe('25 Sep 2026');
    expect(formatDay('2026-09-25', { weekday: 'short', month: 'short', year: false })).toBe('Fri 25 Sep');
    expect(formatLong(d)).toBe('Friday 25 September 2026');
    expect(formatLongDay(d)).toBe('Friday 25 September');
    expect(formatShort(d)).toBe('Fri 25 Sep');
    expect(formatShortYear(d)).toBe('Fri 25 Sep 2026');
    expect(formatDayMonth(d)).toBe('25 Sep');
    expect(formatMonthYear(d)).toBe('September 2026');
  });

  it('writes a time of day on the 24-hour clock', () => {
    expect(formatClock(new Date(2026, 9, 14, 9, 5))).toBe('09:05');
    expect(formatClock(new Date(2026, 9, 14, 14, 30).getTime())).toBe('14:30');
  });

  it('knows the Bahraini weekend', () => {
    expect(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'].map((k) => isWeekend(parseDay(k)))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });
});
