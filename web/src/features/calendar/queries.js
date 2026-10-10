// Calendar queries (pure data). public.js re-exports getUpcomingEvents and getNextExamForModule;
// the rest are used inside the calendar feature.
import { EVENTS, eventDate } from '../../data/calendar';
import { DAY_MS, startOfDay } from './dates';

const appliesTo = (e, year) => year == null || e.year == null || e.year === Number(year);
const fromTime = (from) => startOfDay(from ?? new Date()).getTime();

/**
 * -> CalendarEvent[] from `from` (inclusive, by day), for `year` (+ everyone-events); year undefined/null → all.
 * `from` may be a Date, a timestamp or 'YYYY-MM-DD'; `n` may be Infinity.
 */
export function getUpcomingEvents({ year, from = new Date(), n = 5 } = {}) {
  const t = fromTime(from);
  return EVENTS.filter((e) => appliesTo(e, year) && eventDate(e).getTime() >= t).slice(0, n);
}

/** -> CalendarEvent | null — the next exam (today or later) for a module. */
export function getNextExamForModule(moduleId) {
  const t = startOfDay(new Date()).getTime();
  return EVENTS.find((e) => e.moduleId === moduleId && e.type === 'exam' && eventDate(e).getTime() >= t) || null;
}

/** Exams for a year (null → every year), oldest first. */
export function getExams({ year } = {}) {
  return EVENTS.filter((e) => e.type === 'exam' && appliesTo(e, year));
}

/** The next exam (today or later) for a year; null → any year. */
export function getNextExam({ year, from = new Date() } = {}) {
  const t = fromTime(from);
  return getExams({ year }).find((e) => eventDate(e).getTime() >= t) || null;
}

/** Upcoming exams (today or later) for a year. */
export function getUpcomingExams({ year, from = new Date() } = {}) {
  const t = fromTime(from);
  return getExams({ year }).filter((e) => eventDate(e).getTime() >= t);
}

/**
 * The exam session around an exam: the run of the year's exams with gaps of at most `gapDays`
 * (the October 2026 session for Year 2 is ST2134 on 23 Oct … ST2195 on 6 Nov).
 */
export function getExamSession(exam, { year, gapDays = 21 } = {}) {
  if (!exam) return [];
  const exams = getExams({ year });
  const i = exams.findIndex((e) => e.id === exam.id);
  if (i < 0) return [exam];
  let a = i;
  let b = i;
  const gap = (x, y) => (eventDate(y).getTime() - eventDate(x).getTime()) / DAY_MS;
  while (a > 0 && gap(exams[a - 1], exams[a]) <= gapDays) a -= 1;
  while (b < exams.length - 1 && gap(exams[b], exams[b + 1]) <= gapDays) b += 1;
  return exams.slice(a, b + 1);
}

/**
 * What the exam countdown needs, for a year (null → every year): the next exam, the exams of its
 * session that are still to come (the next one first) and whether that session has already started.
 * null when no exam is ahead.
 */
export function getExamOutlook({ year, from = new Date() } = {}) {
  const next = getNextExam({ year, from });
  if (!next) return null;
  const t = fromTime(from);
  const session = getExamSession(next, { year });
  const ahead = session.filter((e) => eventDate(e).getTime() >= t);
  return { next, ahead, started: ahead.length < session.length };
}

/** Events that apply to a cohort (year null → all) and, optionally, a set of types. */
export function filterEvents({ year, types } = {}) {
  return EVENTS.filter((e) => appliesTo(e, year) && (!types || types.size === 0 || types.has(e.type)));
}

export function getEvent(id) {
  return EVENTS.find((e) => e.id === id) || null;
}
