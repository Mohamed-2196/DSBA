// Calendar-only date helpers: months as { y, m }, the month grid, countdown labels and distances. Days themselves
// (day keys, today in Bahrain, weekdays, month names, formats) come from src/lib/dates.ts, the one home every area
// shares (code quality review CQ-5).
import { addDays, daysUntil, isWeekend, monthName, startOfDay } from '../../lib/dates';
import { countOf } from '../../ui';

/** A month of a year; m is 0-based. */
export interface MonthRef {
  y: number;
  m: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 'Today', 'Tomorrow', 'In 17 days', 'Yesterday', '3 days ago'; more than a month back: 'Past'. */
export function countdownLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < -30) return 'Past';
  return days > 1 ? `In ${days} days` : `${-days} days ago`;
}

/** Compact form for tight lists: 'Today' · 'Tomorrow' · '17 days' · 'Past'. */
export function countdownShort(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return 'Past';
  return `${days} days`;
}

// ── Months ──────────────────────────────────────────────────────────────────────────────────────

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

/** 'YYYY-MM' for the ?month= parameter. */
export const monthKey = ({ y, m }: MonthRef): string => `${y}-${pad(m + 1)}`;
export const sameMonth = (a: MonthRef, b: MonthRef): boolean => a.y === b.y && a.m === b.m;
export const monthOfDate = (date: Date): MonthRef => ({ y: date.getFullYear(), m: date.getMonth() });

/** 'October 2026' */
export const monthTitle = ({ y, m }: MonthRef): string => `${monthName(m)} ${y}`;
/** 'October' */
export const monthLabel = ({ m }: MonthRef): string => monthName(m);

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

// ── Distances ───────────────────────────────────────────────────────────────────────────────────

/** A day count in weeks: 17 → '2 weeks and 3 days', 14 → '2 weeks'. Under a week → null (nothing to add). */
export function weeksAndDays(days: number): string | null {
  if (days < 7) return null;
  const w = Math.floor(days / 7);
  const d = days % 7;
  return d ? `${countOf(w, 'week')} and ${countOf(d, 'day')}` : countOf(w, 'week');
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
  if (weekdays) parts.push(countOf(weekdays, 'weekday'));
  if (weekendDays) parts.push(weekendDays === weekends * 2 ? countOf(weekends, 'weekend') : countOf(weekendDays, 'weekend day'));
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
