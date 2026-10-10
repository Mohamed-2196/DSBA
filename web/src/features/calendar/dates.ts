// Calendar date helpers. Events are calendar days ('YYYY-MM-DD', no time zone) and are compared as
// local midnights, so a countdown counts calendar days whatever the hour.

export const DAY_MS = 86400000;

export interface Weekday {
  short: string;
  long: string;
  two: string;
  one: string;
}

/** Weekday headers, Sunday first (the Bahraini week; v1 also started on Sunday). */
export const WEEKDAYS: readonly Weekday[] = [
  { short: 'Sun', long: 'Sunday', two: 'Su', one: 'S' },
  { short: 'Mon', long: 'Monday', two: 'Mo', one: 'M' },
  { short: 'Tue', long: 'Tuesday', two: 'Tu', one: 'T' },
  { short: 'Wed', long: 'Wednesday', two: 'We', one: 'W' },
  { short: 'Thu', long: 'Thursday', two: 'Th', one: 'T' },
  { short: 'Fri', long: 'Friday', two: 'Fr', one: 'F' },
  { short: 'Sat', long: 'Saturday', two: 'Sa', one: 'S' },
];

/** The weekday of a date (index 0–6 is always in range). */
export const weekdayOf = (date: Date): Weekday => WEEKDAYS[date.getDay()] as Weekday;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const monthLong = (m: number): string => MONTHS[m] ?? '';
const monthShort = (m: number): string => MONTHS_SHORT[m] ?? '';

/** A month of a year; m is 0-based. */
export interface MonthRef {
  y: number;
  m: number;
}

/** Friday and Saturday are the weekend in Bahrain. */
export const isWeekend = (date: Date): boolean => date.getDay() === 5 || date.getDay() === 6;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local midnight Date for 'YYYY-MM-DD'. */
export function parseKey(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Local midnight of a Date / timestamp / 'YYYY-MM-DD'. */
export function startOfDay(input: Date | number | string = new Date()): Date {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return parseKey(input);
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 'YYYY-MM-DD' for a local date. */
export function toKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole calendar days from `from` to `date` (negative = in the past). */
export function daysUntil(date: Date | string, from: Date | number = new Date()): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** 'Today', 'Tomorrow', 'In 17 days', 'Yesterday', '3 days ago'; more than a month back: 'Past'. */
export function countdownLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < -30) return 'Past';
  return days > 1 ? `In ${days} days` : `${-days} days ago`;
}

/** The same inside a sentence: 'today', 'tomorrow', 'in 17 days' (for days that are today or later). */
export function inDays(days: number): string {
  if (days <= 0) return 'today';
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** Compact form for tight lists: 'Today' · 'Tomorrow' · '17 days' · 'Past'. */
export function countdownShort(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return 'Past';
  return `${days} days`;
}

// ── Months ──────────────────────────────────────────────────────────────────────────────────────
/** 'YYYY-MM' for a Date. */
export const monthKeyOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

/** { y, m } (m 0-based) from 'YYYY-MM', or null when malformed. */
export function parseMonthKey(key: string | null | undefined): MonthRef | null {
  const match = typeof key === 'string' ? /^(\d{4})-(\d{2})$/.exec(key) : null;
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  return m >= 0 && m <= 11 && y > 1900 && y < 3000 ? { y, m } : null;
}

export function addMonths({ y, m }: MonthRef, n: number): MonthRef {
  const d = new Date(y, m + n, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

export const monthKey = ({ y, m }: MonthRef): string => `${y}-${pad(m + 1)}`;
export const sameMonth = (a: MonthRef, b: MonthRef): boolean => a.y === b.y && a.m === b.m;
export const monthOfDate = (date: Date): MonthRef => ({ y: date.getFullYear(), m: date.getMonth() });

/** 'October 2026' */
export const monthTitle = ({ y, m }: MonthRef): string => `${monthLong(m)} ${y}`;
/** 'October' */
export const monthName = ({ m }: MonthRef): string => monthLong(m);

/** Weeks (arrays of 7 local Dates, Sunday first) covering a month. */
export function monthMatrix({ y, m }: MonthRef): Date[][] {
  const lead = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: Date[][] = [];
  for (let i = 0; i < cells; i += 1) {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1]?.push(new Date(y, m, 1 - lead + i));
  }
  return weeks;
}

export const addDays = (date: Date, n: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

// ── Formatting (en-GB order, built by hand so no locale adds commas or 'Sept') ──────────────────
// Every format a student sees carries the weekday: a date without its day of the week is not allowed
// out of this file (the only exceptions are month titles and the bare day number of a date block,
// which always sits under its weekday).
/** 'Friday 23 October 2026' */
export const formatLong = (date: Date): string => `${weekdayOf(date).long} ${date.getDate()} ${monthLong(date.getMonth())} ${date.getFullYear()}`;
/** 'Friday 23 October' */
export const formatLongDay = (date: Date): string => `${weekdayOf(date).long} ${date.getDate()} ${monthLong(date.getMonth())}`;
/** 'Fri 23 Oct' */
export const formatShort = (date: Date): string => `${weekdayOf(date).short} ${date.getDate()} ${monthShort(date.getMonth())}`;
/** 'Fri 23 Oct 2026' */
export const formatShortYear = (date: Date): string => `${formatShort(date)} ${date.getFullYear()}`;
/** 'Oct' */
export const formatMonthShort = (date: Date): string => monthShort(date.getMonth());
/** 'October' */
export const formatMonthLong = (date: Date): string => monthLong(date.getMonth());
/** 'October 2026' */
export const formatMonthYear = (date: Date): string => `${monthLong(date.getMonth())} ${date.getFullYear()}`;

// ── Distances ───────────────────────────────────────────────────────────────────────────────────
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A day count in weeks: 17 → '2 weeks and 3 days', 14 → '2 weeks'. Under a week → null (nothing to add). */
export function weeksAndDays(days: number): string | null {
  if (days < 7) return null;
  const w = Math.floor(days / 7);
  const d = days % 7;
  return d ? `${plural(w, 'week')} and ${plural(d, 'day')}` : plural(w, 'week');
}

export interface DaysBreakdown {
  days: number;
  weekdays: number;
  weekendDays: number;
  weekends: number;
}

/**
 * The days from `from` (included) up to `to` (not included), split the Bahraini way: Sunday to
 * Thursday are weekdays, Friday and Saturday the weekend. `weekends` counts whole weekends only.
 * 6 Oct → 23 Oct 2026: { days: 17, weekdays: 13, weekendDays: 4, weekends: 2 }.
 */
export function daysBreakdown(from: Date, to: Date): DaysBreakdown {
  const start = startOfDay(from);
  const days = Math.max(0, daysUntil(to, start));
  let weekdays = 0;
  let weekendDays = 0;
  let weekends = 0;
  for (let i = 0; i < days; i += 1) {
    const d = addDays(start, i);
    if (!isWeekend(d)) weekdays += 1;
    else {
      weekendDays += 1;
      if (d.getDay() === 6 && i > 0) weekends += 1; // a Saturday whose Friday is counted too
    }
  }
  return { days, weekdays, weekendDays, weekends };
}

/** '13 weekdays and 2 weekends' (a split weekend is counted in days: '4 weekdays and 1 weekend day'). */
export function breakdownLabel({ days, weekdays, weekendDays, weekends }: DaysBreakdown): string | null {
  if (days < 2) return null;
  const parts: string[] = [];
  if (weekdays) parts.push(plural(weekdays, 'weekday'));
  if (weekendDays) parts.push(weekendDays === weekends * 2 ? plural(weekends, 'weekend') : plural(weekendDays, 'weekend day'));
  return parts.join(' and ');
}

/**
 * The gap between two things on the calendar, `days` apart: 'Same day' · 'Next day' · '4 days later'.
 * Two exams on consecutive days are 'Back to back' (pass `exams`).
 */
export function gapLabel(days: number, { exams = false }: { exams?: boolean } = {}): string {
  if (days <= 0) return 'Same day';
  if (days === 1) return exams ? 'Back to back' : 'Next day';
  return `${days} days later`;
}
