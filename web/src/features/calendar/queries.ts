// Calendar queries: pure functions over a list of events from the API.
import { addDaysToKey, parseDay, todayKey, type DayKey } from '../../lib/dates';
import { isMine } from '../papers/public';
import { TYPE_ORDER } from './eventMeta';
import type { CalendarEvent, EventType } from './types';

/** Local-midnight Date of an event (dates are calendar days, no time zone). */
export const eventDate = (e: Pick<CalendarEvent, 'date'>): Date => parseDay(e.date);

/** The last day an event covers: its end date, or its date. */
export const lastDay = (e: Pick<CalendarEvent, 'date' | 'endDate'>): DayKey => (e.endDate && e.endDate > e.date ? e.endDate : e.date);

const typeRank = (type: EventType): number => {
  const i = TYPE_ORDER.indexOf(type);
  return i < 0 ? TYPE_ORDER.length : i;
};

/** Events by date, oldest first; events on the same day keep the order they came in. */
export function sortEvents<T extends Pick<CalendarEvent, 'date'>>(events: readonly T[]): T[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i)
    .map(({ e }) => e);
}

/**
 * The order of a list: by date; on the same day confirmed dates come before unconfirmed ones, then the more
 * important type (exams first, in TYPE_ORDER); ties keep the order they came in.
 */
export function listOrder<T extends Pick<CalendarEvent, 'date' | 'sample' | 'type'>>(events: readonly T[]): T[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || Number(a.e.sample) - Number(b.e.sample) || typeRank(a.e.type) - typeRank(b.e.type) || a.i - b.i)
    .map(({ e }) => e);
}

/** A student's papers (module ids; null: every module of their year), for the filters below. */
type Papers = ReadonlySet<string> | null | undefined;

/**
 * Events that apply to a cohort (year null → all), to a student's papers when given (a module's events only for
 * those modules) and, optionally, a set of types (empty: every type).
 */
export function filterEvents(events: readonly CalendarEvent[], { year, types, papers }: { year?: number | null; types?: ReadonlySet<EventType>; papers?: Papers } = {}): CalendarEvent[] {
  return events.filter((e) => isMine(e, year ?? null, papers ?? null) && (!types || types.size === 0 || types.has(e.type)));
}

/** Events still to come on `from` (a day key): starting that day or later, or running through it. In list order. */
export function upcomingFrom(events: readonly CalendarEvent[], from: DayKey): CalendarEvent[] {
  return listOrder(events.filter((e) => lastDay(e) >= from));
}

export interface NextExam {
  /** The first confirmed exam ahead, or the first exam ahead when none is confirmed. */
  exam: CalendarEvent;
  /** Unconfirmed exams before it, in order. */
  unconfirmedBefore: CalendarEvent[];
  /** How many exams come after it. */
  after: number;
}

/**
 * A cohort's next exam from `today` (a day key; year null → every cohort), for the top of the page. Confirmed
 * dates come first: an unconfirmed exam never takes the place of a confirmed one, it is listed as coming before
 * it. null when no exam is ahead.
 */
export function nextExamFor(events: readonly CalendarEvent[], { year, today, papers }: { year: number | null; today: DayKey; papers?: Papers }): NextExam | null {
  const ahead = listOrder(events.filter((e) => e.type === 'exam' && isMine(e, year, papers ?? null) && e.date >= today));
  const i = Math.max(0, ahead.findIndex((e) => !e.sample));
  const exam = ahead[i];
  if (!exam) return null;
  return { exam, unconfirmedBefore: ahead.slice(0, i), after: ahead.length - i - 1 };
}

/** The last day of the week ahead: `today` and the `days - 1` days after it. */
export const weekEnd = (today: DayKey, days = 7): DayKey => addDaysToKey(today, days - 1);

/** What a cohort has on in the week ahead (today and the six days after it), every type, in list order. */
export function weekAhead(events: readonly CalendarEvent[], { year, today, days = 7, papers }: { year: number | null; today: DayKey; days?: number; papers?: Papers }): CalendarEvent[] {
  const end = weekEnd(today, days);
  return listOrder(events.filter((e) => isMine(e, year, papers ?? null) && e.date <= end && lastDay(e) >= today));
}

export interface DayGroup {
  key: DayKey;
  date: Date;
  events: CalendarEvent[];
}

export interface MonthGroup {
  /** 'YYYY-MM' */
  key: string;
  y: number;
  /** 0-based */
  m: number;
  days: DayGroup[];
}

/**
 * Events (in list order) grouped by month, then by day. An event that started before `from` and is still
 * running is listed on `from`.
 */
export function groupByMonth(events: readonly CalendarEvent[], from?: DayKey): MonthGroup[] {
  const shown = events.map((e) => ({ e, key: from && e.date < from ? from : e.date }));
  shown.sort((a, b) => a.key.localeCompare(b.key));
  const months: MonthGroup[] = [];
  for (const { e, key } of shown) {
    const mk = key.slice(0, 7);
    let month = months[months.length - 1];
    if (!month || month.key !== mk) {
      const date = parseDay(key);
      month = { key: mk, y: date.getFullYear(), m: date.getMonth(), days: [] };
      months.push(month);
    }
    const day = month.days[month.days.length - 1];
    if (day && day.key === key) day.events.push(e);
    else month.days.push({ key, date: parseDay(key), events: [e] });
  }
  return months;
}

/** Every day key ('YYYY-MM-DD') an event covers: its date, through its end date when it has one. */
export function eventDays(e: Pick<CalendarEvent, 'date' | 'endDate'>): DayKey[] {
  const end = lastDay(e);
  const out: DayKey[] = [];
  for (let key = e.date; key <= end && out.length < 120; key = addDaysToKey(key, 1)) out.push(key);
  return out;
}

/** Events grouped by the days they cover (a multi-day event appears on each of its days). */
export function groupByDay(events: readonly CalendarEvent[]): Map<DayKey, CalendarEvent[]> {
  const map = new Map<DayKey, CalendarEvent[]>();
  for (const e of events) {
    for (const key of eventDays(e)) {
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
  }
  return map;
}

/** 'YYYY-MM-DD' of today in Bahrain plus `days`. */
export const dayKeyFromToday = (days = 0, now: Date | number = Date.now()): DayKey => addDaysToKey(todayKey(now), days);
