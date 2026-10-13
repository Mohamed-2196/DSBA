// Calendar-only date helpers: months as { y, m }, the month grid and countdown labels. Days themselves
// (day keys, today in Bahrain, weekdays, month names, formats) come from src/lib/dates.ts.
import { monthName } from '../../lib/dates';

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
