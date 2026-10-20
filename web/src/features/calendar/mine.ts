// A student's own calendar: their events laid out as occurrences, and the programme dates they keep off it.
// Pure functions. The API counts occurrences the same way (api/app/services/my_calendar.py): a repeat runs every
// day, week, two weeks or month from its date until its repeat end, or for a year without one, less the days taken
// off it (skipped). A monthly repeat keeps its day of the month, and falls on a month's last day when the month has
// no such day (the 31st's on 30 April, 28 or 29 February).
import {
  addDaysToKey,
  addMonthsToKey,
  dayOrdinal,
  daysBetween,
  formatDay,
  parseDay,
  weekdayOf,
  type DayKey,
} from '../../lib/dates';
import type { CalendarEvent, CalendarPrefs, PersonalColour, PersonalEvent, PlanCard, Reminder, Repeat } from './types';

export const REPEAT_DAYS = 365;
/** The days between the occurrences of a repeat; a monthly one counts months. */
const STEP_DAYS: Record<Exclude<Repeat, 'none' | 'monthly'>, number> = { daily: 1, weekly: 7, fortnightly: 14 };
const EVERY: Record<Exclude<Repeat, 'none'>, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  fortnightly: 'Every two weeks',
  monthly: 'Every month',
};
/** At most this many occurrences of one event (a daily repeat over two years). */
const MAX_OCCURRENCES = 800;
const PREFIX = 'mine-';
const UUID_LENGTH = 36;

export const COLOURS: readonly PersonalColour[] = ['violet', 'teal', 'green', 'orange', 'rose', 'slate'];
export const COLOUR_LABELS: Record<PersonalColour, string> = {
  violet: 'Violet',
  teal: 'Teal',
  green: 'Green',
  orange: 'Orange',
  rose: 'Rose',
  slate: 'Slate',
};

export const REMINDERS: readonly { value: Reminder | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'When it starts' },
  { value: 10, label: '10 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

/** '14:00' from the API's '14:00:00'. */
export const clock = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null);

/** '14:00–15:30', '14:00', or null for an all-day event. */
export function timeRange(p: Pick<PersonalEvent, 'startTime' | 'endTime'>): string | null {
  const start = clock(p.startTime);
  if (!start) return null;
  const end = clock(p.endTime);
  return end ? `${start}–${end}` : start;
}

/** The last day an occurrence can start on. */
export function lastRepeat(p: Pick<PersonalEvent, 'date' | 'repeat' | 'repeatUntil'>): DayKey {
  if (p.repeat === 'none') return p.date;
  return p.repeatUntil ?? addDaysToKey(p.date, REPEAT_DAYS);
}

/** The day of the month a monthly repeat falls on (in a month without it: that month's last day). */
export const monthDayOf = (p: Pick<PersonalEvent, 'date' | 'monthDay'>): number =>
  p.monthDay ?? Number(p.date.slice(8, 10));

/** The day of a repeat's occurrence number `n` (0: its first day), days taken off it included. */
function nthDay(p: Pick<PersonalEvent, 'date' | 'repeat' | 'monthDay'>, n: number): DayKey {
  if (p.repeat === 'none') return p.date;
  if (p.repeat === 'monthly') return addMonthsToKey(p.date, n, monthDayOf(p));
  return addDaysToKey(p.date, STEP_DAYS[p.repeat] * n);
}

/** The days occurrences of `p` start on, oldest first: its days less the ones taken off it. */
export function occurrenceDays(
  p: Pick<PersonalEvent, 'date' | 'repeat' | 'repeatUntil' | 'monthDay' | 'skipped'>,
): DayKey[] {
  if (p.repeat === 'none') return [p.date];
  const last = lastRepeat(p);
  const skipped = new Set(p.skipped);
  const days: DayKey[] = [];
  for (let n = 0; days.length < MAX_OCCURRENCES; n++) {
    const day = nthDay(p, n);
    if (day > last) break;
    if (!skipped.has(day)) days.push(day);
  }
  return days;
}

/** Whether `p` repeats: its occurrences can be changed one at a time. */
export const repeats = (p: Pick<PersonalEvent, 'repeat'>): boolean => p.repeat !== 'none';

export const occurrenceId = (p: Pick<PersonalEvent, 'id' | 'repeat'>, day: DayKey): string =>
  p.repeat === 'none' ? `${PREFIX}${p.id}` : `${PREFIX}${p.id}-${day}`;

/** The event id inside an occurrence id ('mine-<uuid>' or 'mine-<uuid>-<date>'), or null for a programme date. */
export const seriesOf = (id: string): string | null =>
  id.startsWith(PREFIX) && id.length >= PREFIX.length + UUID_LENGTH
    ? id.slice(PREFIX.length, PREFIX.length + UUID_LENGTH)
    : null;

/** One occurrence, in the shape every list, grid and drawer of the calendar takes. */
export function toOccurrence(p: PersonalEvent, day: DayKey): CalendarEvent {
  const span = p.endDate ? daysBetween(p.date, p.endDate) : 0;
  return {
    id: occurrenceId(p, day),
    date: day,
    endDate: span > 0 ? addDaysToKey(day, span) : null,
    time: timeRange(p),
    place: p.place,
    title: p.title,
    type: 'event',
    year: null,
    moduleId: null,
    unitCode: null,
    duration: null,
    rules: null,
    source: null,
    checkedOn: null,
    employerId: null,
    sample: false,
    resit: false,
    mine: p,
  };
}

const PLAN_PREFIX = 'plan-';

/** A card of the student's plan on its day, in the shape every list, grid and drawer of the calendar takes. */
export function planEvent(card: PlanCard): CalendarEvent {
  return {
    id: `${PLAN_PREFIX}${card.id}`,
    date: card.due,
    endDate: null,
    time: clock(card.dueTime),
    place: null,
    title: card.title,
    type: 'event',
    year: null,
    moduleId: null,
    unitCode: null,
    duration: null,
    rules: null,
    source: null,
    checkedOn: null,
    employerId: null,
    sample: false,
    resit: false,
    plan: card,
  };
}

/** Where a card of the plan opens on its board. */
export const planCardUrl = (card: Pick<PlanCard, 'id' | 'boardId'>): string =>
  `/board?board=${encodeURIComponent(card.boardId)}&card=${encodeURIComponent(card.id)}`;

/** Every occurrence of the student's events. */
export const occurrences = (events: readonly PersonalEvent[]): CalendarEvent[] =>
  events.flatMap((p) => occurrenceDays(p).map((day) => toOccurrence(p, day)));

/**
 * A list with one row for each repeat of the student's own: the first occurrence it holds (the next one, in a list
 * of what is ahead) stands for the repeat, and its later ones leave. Everything else stays, in order.
 */
export function oneRowPerRepeat(events: readonly CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!e.mine || e.mine.repeat === 'none') return true;
    if (seen.has(e.mine.id)) return false;
    seen.add(e.mine.id);
    return true;
  });
}

/**
 * An event by id among `events`. An occurrence id that no longer matches (the repeat moved, or a link names the
 * event without a date) opens the event's next occurrence from `today`, or its last.
 */
export function findEvent(events: readonly CalendarEvent[], id: string | null, today: DayKey): CalendarEvent | null {
  if (!id) return null;
  const exact = events.find((e) => e.id === id);
  if (exact) return exact;
  const series = seriesOf(id);
  if (!series) return null;
  const all = events.filter((e) => e.mine?.id === series);
  return all.find((e) => (e.endDate ?? e.date) >= today) ?? all[all.length - 1] ?? null;
}

/** 'Every two weeks until 31 December 2026', 'Every month for a year', or null. */
export function repeatLabel(p: Pick<PersonalEvent, 'repeat' | 'repeatUntil'>): string | null {
  if (p.repeat === 'none') return null;
  const every = EVERY[p.repeat];
  return p.repeatUntil ? `${every} until ${formatDay(parseDay(p.repeatUntil))}` : `${every} for a year`;
}

/** 'Tuesdays', 'Every other Tuesday', 'Every month' or 'Every day': how often a repeat comes, for a short line. */
export function repeatShort(p: Pick<PersonalEvent, 'repeat' | 'date'>): string | null {
  if (p.repeat === 'none') return null;
  const weekday = weekdayOf(parseDay(p.date)).long;
  if (p.repeat === 'weekly') return `${weekday}s`;
  return p.repeat === 'fortnightly' ? `Every other ${weekday}` : EVERY[p.repeat];
}

/**
 * The day a monthly repeat on day `day` of the month falls on, in words, with where it goes in a month without that
 * day: 'On the 18th of every month.', 'On the 31st of every month, or the last day of shorter months.'
 */
export function monthlyRule(day: number): string {
  const on = `On the ${dayOrdinal(day)} of every month`;
  if (day <= 28) return `${on}.`;
  return `${on}, or the last day of ${day === 31 ? 'shorter months' : 'February'}.`;
}

/**
 * The day of the month a monthly repeat saved from the form falls on. While the form keeps the first day it opened
 * with (`from`: the event's own, or the day a change from one day on starts), the event's day of the month stays (a
 * repeat on the 31st opened on 28 February); a new first day brings its own.
 */
export function formMonthDay(
  event: Pick<PersonalEvent, 'date' | 'repeat' | 'monthDay'> | null,
  from: DayKey,
  date: DayKey,
): number {
  return event?.repeat === 'monthly' && date === from ? monthDayOf(event) : Number(date.slice(8, 10));
}

/** What a repeat from `date` means, under the choice in the form: 'Every Sunday.', 'On the 18th of every month.' */
export function repeatHint(repeat: Repeat, date: DayKey, monthDay: number): string | undefined {
  const weekday = weekdayOf(parseDay(date)).long;
  if (repeat === 'weekly') return `Every ${weekday}.`;
  if (repeat === 'fortnightly') return `Every other ${weekday}.`;
  return repeat === 'monthly' ? monthlyRule(monthDay) : undefined;
}

/** The reminders an all-day event offers: it "starts" at 9:00. */
export const ALL_DAY_REMINDERS: readonly { value: Reminder | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 0, label: 'On the day, at 9:00' },
  { value: 1440, label: 'The day before, at 9:00' },
];

/** '30 minutes before', 'The day before, at 9:00', or null without a reminder. */
export function reminderLabel(remind: Reminder | null, allDay: boolean): string | null {
  if (remind == null) return null;
  return (allDay ? ALL_DAY_REMINDERS : REMINDERS).find((r) => r.value === remind)?.label ?? `${remind} minutes before`;
}

/** Whether the student keeps a programme date off their calendar: the date itself, its module or its type. */
export function isHidden(
  e: Pick<CalendarEvent, 'id' | 'moduleId' | 'type' | 'mine' | 'plan'>,
  prefs: CalendarPrefs | null | undefined,
): boolean {
  if (!prefs || e.mine || e.plan) return false;
  return (
    prefs.hiddenEvents.includes(e.id) ||
    prefs.hiddenTypes.includes(e.type) ||
    (!!e.moduleId && prefs.hiddenModules.includes(e.moduleId))
  );
}

/**
 * The programme dates on the student's calendar, their own events' occurrences and, while they show it, their plan,
 * by date.
 */
export function myCalendar(
  programme: readonly CalendarEvent[],
  mine: readonly PersonalEvent[],
  prefs: CalendarPrefs | null | undefined,
  plan: readonly PlanCard[] = [],
): CalendarEvent[] {
  const shown = programme.filter((e) => !isHidden(e, prefs));
  const planned = prefs?.showPlan ? plan.map(planEvent) : [];
  if (!mine.length && !planned.length) return shown;
  return [...shown, ...occurrences(mine), ...planned].sort((a, b) => a.date.localeCompare(b.date));
}

// ── one day on the month grid ─────────────────────────────────────────────────────────────────

/**
 * The order of a day's events on the month grid, where only the first few fit: what starts that day before what
 * runs on from an earlier day (a window, a break); of those, exams and deadlines, then the student's own events by
 * start time (all-day ones first), then their plan, then the other programme dates. Ties keep the order they came in.
 */
export function dayOrder(events: readonly CalendarEvent[], day: DayKey): CalendarEvent[] {
  const rank = (e: CalendarEvent): number =>
    e.date < day ? 4 : e.mine ? 1 : e.plan ? 2 : e.type === 'exam' || e.type === 'deadline' ? 0 : 3;
  const at = (e: CalendarEvent): string => e.mine?.startTime ?? e.plan?.dueTime ?? '';
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || at(a.e).localeCompare(at(b.e)) || a.i - b.i)
    .map(({ e }) => e);
}
