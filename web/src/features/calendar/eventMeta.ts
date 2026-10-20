// Presentation helpers for calendar events (shared by the page, the drawer and UpcomingEvents).
// Pure functions: the module an event belongs to is passed in (useModules().getModule in components).
import type { ModuleSummary } from '../../api/types';
import { daysBetween, formatDay, monthName, parseDay, type DayKey } from '../../lib/dates';
import type { CalendarEvent, EventType, EventTypeMeta } from './types';

export const EVENT_TYPES: Record<EventType, EventTypeMeta> = {
  exam: { label: 'Exam', plural: 'exams', token: '--exam', color: 'var(--exam)' },
  mock: { label: 'Mock exam', plural: 'mock exams', token: '--accent', color: 'var(--accent)' },
  revision: { label: 'Revision', plural: 'revision sessions', token: '--success-fill', color: 'var(--success-fill)' },
  deadline: { label: 'Deadline', plural: 'deadlines', token: '--warning-fill', color: 'var(--warning-fill)' },
  // Application windows of Career Navigator's employers.
  careers: { label: 'Careers', plural: 'careers dates', token: '--ink', color: 'var(--ink)' },
  // Programme events (Speech Day, launches, socials). Amber is the one warm token the other types leave free; it is
  // also Year 3's cohort colour, so it never appears without the word "Event".
  event: { label: 'Event', plural: 'events', token: '--y3', color: 'var(--y3)' },
  break: { label: 'Break', plural: 'breaks', token: '--ink-3', color: 'var(--ink-3)' },
  term: { label: 'Term dates', plural: 'term dates', token: '--ink-2', color: 'var(--ink-2)' },
};

/** Legend / filter order. Also the order of importance when one day holds several events. */
export const TYPE_ORDER: readonly EventType[] = [
  'exam',
  'mock',
  'revision',
  'deadline',
  'careers',
  'event',
  'break',
  'term',
];

export const isEventType = (value: unknown): value is EventType => typeof value === 'string' && value in EVENT_TYPES;

export type BadgeTone = 'neutral' | 'cobalt' | 'signal' | 'alert' | 'exam' | 'warning';

/** Badge tone per type (ui Badge tones; 'event' is tinted amber by the calendar's own CSS). */
export const TYPE_BADGE_TONE: Record<EventType, BadgeTone> = {
  exam: 'exam',
  mock: 'cobalt',
  revision: 'signal',
  deadline: 'warning',
  careers: 'neutral',
  event: 'neutral',
  break: 'neutral',
  term: 'neutral',
};

export const typeLabel = (type: string): string => (isEventType(type) ? EVENT_TYPES[type].label : 'Event');

/** A type's dates together, inside a sentence: 'exams', 'mock exams', 'careers dates'. */
export const typePlural = (type: string): string => (isEventType(type) ? EVENT_TYPES[type].plural : 'dates');

/**
 * Title split for typographic display: { code: 'ST2134', rest: 'Advanced Statistics: … (October exam)' }.
 * code is null when the event has no unit code or the title doesn't start with it.
 */
export function splitTitle(e: Pick<CalendarEvent, 'unitCode' | 'title'>): { code: string | null; rest: string } {
  if (e.unitCode && e.title.startsWith(`${e.unitCode} `))
    return { code: e.unitCode, rest: e.title.slice(e.unitCode.length + 1) };
  return { code: null, rest: e.title };
}

/**
 * What happens, without repeating the module the unit code already names:
 * 'Statistical Inference revision session' → 'Revision session', 'Business mock exam' → 'Mock exam'.
 * Titles that don't start with their module's name are left alone.
 */
function whatHappens(e: CalendarEvent, m: ModuleSummary | null): string {
  const rest = splitTitle(e).rest;
  if (!m) return rest;
  const lower = rest.toLowerCase();
  for (const name of [m.name, m.name.split(': ').pop(), m.shortName]) {
    if (!name || !lower.startsWith(`${name.toLowerCase()} `)) continue;
    const cut = rest.slice(name.length + 1);
    if (/^[a-z]/i.test(cut)) return cut.charAt(0).toUpperCase() + cut.slice(1);
  }
  return rest;
}

/**
 * Text for a grid chip: { code, line }. Exams read as code + module ("ST2134", "Statistical inference");
 * everything else as code + what happens ("ST2134", "Revision session"; "ST1215", "First day of Stats
 * MCQ on VLE").
 */
export function chipText(e: CalendarEvent, m: ModuleSummary | null): { code: string | null; line: string } {
  if (!e.unitCode) return { code: null, line: e.title };
  if (e.type === 'exam') return { code: e.unitCode, line: m ? m.shortName : splitTitle(e).rest };
  return { code: e.unitCode, line: whatHappens(e, m) };
}

/** '12:30 PM, Auditorium' when the organiser published a time or a place, else null. */
export const timeAndPlace = (e: Pick<CalendarEvent, 'time' | 'place'>): string | null =>
  [e.time, e.place].filter(Boolean).join(', ') || null;

export const TIME_NOT_SET = 'Time not set yet';

/**
 * The time and place a list shows under an event: '9:00 AM, Exam hall'. An exam always has a line: without a
 * time it reads 'Time not set yet' (with the place when there is one). Anything else: null without either.
 */
export function whenAndWhere(e: Pick<CalendarEvent, 'type' | 'time' | 'place'>): string | null {
  if (e.type !== 'exam') return timeAndPlace(e);
  return [e.time || TIME_NOT_SET, e.place].filter(Boolean).join(', ');
}

/** Screen-reader summary of an event. */
export function eventSummary(e: CalendarEvent): string {
  if (e.mine) return `${e.title}, your event${e.time ? `, ${e.time}` : ''}`;
  if (e.plan) return `${e.title}, your plan${e.time ? `, ${e.time}` : ''}`;
  if (e.resit) return `${e.title}, ${RESIT_LABEL.toLowerCase()}, for students retaking it`;
  return `${e.title}, ${typeLabel(e.type)}${e.year ? `, Year ${e.year}` : ', all years'}`;
}

/**
 * A window that is open today (a VLE MCQ, coursework, applications): '4 days left' counting today, 'Last day
 * today'. null when the event is a single day or isn't running today.
 */
export function windowLeft(e: Pick<CalendarEvent, 'date' | 'endDate'>, today: DayKey): string | null {
  if (!e.endDate || e.endDate <= e.date || e.date > today || e.endDate < today) return null;
  const left = daysBetween(today, e.endDate);
  return left === 0 ? 'Last day today' : `${left + 1} days left`;
}

/**
 * What an employer's card says about a careers date: 'Opens in January' (more than a month away), 'Opens 5
 * January', 'Closes 30 November'. A careers date without an end day is a closing date. null once it has closed.
 */
export function applicationLine(e: Pick<CalendarEvent, 'date' | 'endDate'>, today: DayKey): string | null {
  const close = e.endDate && e.endDate > e.date ? e.endDate : null;
  if (close && e.date > today) {
    const opens = parseDay(e.date);
    return daysBetween(today, e.date) > 31
      ? `Opens in ${monthName(opens.getMonth())}`
      : `Opens ${formatDay(opens, { year: false })}`;
  }
  const last = close ?? e.date;
  if (last < today) return null;
  return `Closes ${formatDay(parseDay(last), { year: false })}`;
}

/** 'Checked 10 October 2026 against UoL exam timetable' style line: where a date comes from. null without a source. */
export function sourceLine(e: Pick<CalendarEvent, 'source' | 'checkedOn'>): string | null {
  if (!e.source) return null;
  return e.checkedOn ? `Source: ${e.source}. Checked ${formatDay(parseDay(e.checkedOn))}.` : `Source: ${e.source}.`;
}

// ── a programme date or one of the student's own events ──────────────────────────────────────

type Kind = Pick<CalendarEvent, 'type' | 'mine' | 'plan'> & { resit?: boolean };

/** What a resit is called wherever a date's type shows. */
export const RESIT_LABEL = 'Resit';

/** A programme date's type as a list shows it: 'Exam', 'Resit', 'Mock exam', … */
export const dateLabel = (e: Pick<CalendarEvent, 'type'> & { resit?: boolean }): string =>
  e.resit ? RESIT_LABEL : typeLabel(e.type);

const FINAL_YEAR = 3;

/** Whom a resit is for, under its date: the year after the module's and anyone resitting it. null for other dates. */
export function resitNote(e: Pick<CalendarEvent, 'resit' | 'year'>): string | null {
  if (!e.resit) return null;
  const next = e.year && e.year < FINAL_YEAR ? `Year ${e.year + 1} and ` : '';
  return `For students retaking the module: ${next}anyone who ticks “I’m resitting this” on its page.`;
}

/** 'Exam', 'Resit', 'Mock exam', … 'Your event' or 'Your plan'. */
export const kindLabel = (e: Kind): string => (e.mine ? 'Your event' : e.plan ? 'Your plan' : dateLabel(e));

/** The class that colours an event's dot: its type's, the colour the student gave their own event, or the plan's. */
export const dotClass = (e: Kind): string =>
  e.mine ? `cal-dot--mine cal-colour--${e.mine.colour}` : e.plan ? 'cal-dot--plan' : `cal-dot--${e.type}`;

/** The tone class of a list row. */
export const toneClass = (e: Kind): string =>
  e.mine ? `cal-tone--mine cal-colour--${e.mine.colour}` : e.plan ? 'cal-tone--plan' : `cal-tone--${e.type}`;

/** The class of a month-grid chip. */
export const chipClass = (e: Kind): string =>
  e.mine ? `cal-chip--mine cal-colour--${e.mine.colour}` : e.plan ? 'cal-chip--plan' : `cal-chip--${e.type}`;

/** The band colour of a date leaf. */
export const leafTone = (e: Kind): string => (e.mine || e.plan ? 'neutral' : e.type);
