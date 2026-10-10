// Calendar queries: pure functions over a list of events from the API (oldest first).
import { DAY_MS, addDays, parseKey, startOfDay, toKey } from './dates';
import { appliesTo } from './eventMeta';
import type { CalendarEvent, EventType, ExamOutlook } from './types';

/** Local-midnight Date of an event (dates are calendar days, no time zone). */
export const eventDate = (e: Pick<CalendarEvent, 'date'>): Date => parseKey(e.date);

const fromTime = (from: Date | number | string | undefined): number => startOfDay(from ?? new Date()).getTime();

/** Events by date, oldest first; events on the same day keep the order they came in. */
export function sortEvents<T extends Pick<CalendarEvent, 'date'>>(events: readonly T[]): T[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i)
    .map(({ e }) => e);
}

/** Events that apply to a cohort (year null → all) and, optionally, a set of types. */
export function filterEvents(events: readonly CalendarEvent[], { year, types }: { year?: number | null; types?: ReadonlySet<EventType> } = {}): CalendarEvent[] {
  return events.filter((e) => appliesTo(e, year) && (!types || types.size === 0 || types.has(e.type)));
}

/** Events from `from` (inclusive, by day), for `year` (+ everyone-events); year null → all. n may be Infinity. */
export function upcomingFrom(events: readonly CalendarEvent[], { year, from = new Date(), n = 5 }: { year?: number | null; from?: Date | number | string; n?: number } = {}): CalendarEvent[] {
  const t = fromTime(from);
  return events.filter((e) => appliesTo(e, year) && eventDate(e).getTime() >= t).slice(0, n);
}

/** Exams for a year (null → every year), oldest first. */
export function examsFor(events: readonly CalendarEvent[], year: number | null | undefined): CalendarEvent[] {
  return events.filter((e) => e.type === 'exam' && appliesTo(e, year));
}

/** The next exam (today or later) for a year; null → any year. */
export function nextExam(events: readonly CalendarEvent[], { year, from = new Date() }: { year?: number | null; from?: Date | number } = {}): CalendarEvent | null {
  const t = fromTime(from);
  return examsFor(events, year).find((e) => eventDate(e).getTime() >= t) ?? null;
}

/** Upcoming exams (today or later) for a year. */
export function upcomingExams(events: readonly CalendarEvent[], { year, from = new Date() }: { year?: number | null; from?: Date | number } = {}): CalendarEvent[] {
  const t = fromTime(from);
  return examsFor(events, year).filter((e) => eventDate(e).getTime() >= t);
}

/**
 * The exam session around an exam: the run of the year's exams with gaps of at most `gapDays`
 * (the October 2026 session for Year 2 is ST2134 on 23 Oct … ST2195 on 6 Nov).
 */
export function examSession(events: readonly CalendarEvent[], exam: CalendarEvent, { year, gapDays = 21 }: { year?: number | null; gapDays?: number } = {}): CalendarEvent[] {
  const exams = examsFor(events, year);
  const i = exams.findIndex((e) => e.id === exam.id);
  if (i < 0) return [exam];
  let a = i;
  let b = i;
  const gap = (x: CalendarEvent, y: CalendarEvent) => (eventDate(y).getTime() - eventDate(x).getTime()) / DAY_MS;
  while (a > 0 && gap(exams[a - 1] as CalendarEvent, exams[a] as CalendarEvent) <= gapDays) a -= 1;
  while (b < exams.length - 1 && gap(exams[b] as CalendarEvent, exams[b + 1] as CalendarEvent) <= gapDays) b += 1;
  return exams.slice(a, b + 1);
}

/**
 * What the exam countdown needs, for a year (null → every year): the next exam, the exams of its
 * session that are still to come (the next one first) and whether that session has already started.
 * null when no exam is ahead.
 */
export function examOutlook(events: readonly CalendarEvent[], { year, from = new Date() }: { year?: number | null; from?: Date | number } = {}): ExamOutlook | null {
  const next = nextExam(events, { year, from });
  if (!next) return null;
  const t = fromTime(from);
  const session = examSession(events, next, { year });
  const ahead = session.filter((e) => eventDate(e).getTime() >= t);
  return { next, ahead, started: ahead.length < session.length };
}

/** Every day key ('YYYY-MM-DD') an event covers: its date, through its end date when it has one. */
export function eventDays(e: Pick<CalendarEvent, 'date' | 'endDate'>): string[] {
  if (!e.endDate || e.endDate <= e.date) return [e.date];
  const out: string[] = [];
  const end = parseKey(e.endDate);
  for (let d = parseKey(e.date); d <= end && out.length < 120; d = addDays(d, 1)) out.push(toKey(d));
  return out;
}

/** Events grouped by the days they cover (a multi-day event appears on each of its days). */
export function groupByDay(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    for (const key of eventDays(e)) {
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
  }
  return map;
}

/** 'YYYY-MM-DD' of today plus `days` (local). */
export const dayKeyFromToday = (days = 0, now: Date | number = new Date()): string => toKey(addDays(startOfDay(now), days));
