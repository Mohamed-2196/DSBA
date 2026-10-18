// A student's own calendar: their events laid out as occurrences, and the programme dates they keep off it.
// Pure functions. The API counts occurrences the same way (api/app/services/my_calendar.py): a repeat runs every
// day or week from its date until its repeat end, or for a year without one, less the days taken off it (skipped).
import { addDaysToKey, daysBetween, formatDay, parseDay, weekdayOf, type DayKey } from '../../lib/dates';
import type { CalendarEvent, CalendarPrefs, PersonalColour, PersonalEvent, Reminder } from './types';

export const REPEAT_DAYS = 365;
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

/** The days occurrences of `p` start on, oldest first: its days less the ones taken off it. */
export function occurrenceDays(p: Pick<PersonalEvent, 'date' | 'repeat' | 'repeatUntil' | 'skipped'>): DayKey[] {
  if (p.repeat === 'none') return [p.date];
  const step = p.repeat === 'weekly' ? 7 : 1;
  const last = lastRepeat(p);
  const skipped = new Set(p.skipped);
  const days: DayKey[] = [];
  for (let day = p.date; day <= last && days.length < MAX_OCCURRENCES; day = addDaysToKey(day, step))
    if (!skipped.has(day)) days.push(day);
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
    mine: p,
  };
}

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

/** 'Every week until 31 December 2026', 'Every day for a year', or null. */
export function repeatLabel(p: Pick<PersonalEvent, 'repeat' | 'repeatUntil'>): string | null {
  if (p.repeat === 'none') return null;
  const every = p.repeat === 'weekly' ? 'Every week' : 'Every day';
  return p.repeatUntil ? `${every} until ${formatDay(parseDay(p.repeatUntil))}` : `${every} for a year`;
}

/** 'Tuesdays', or 'Every day': how often a repeat comes, for a short line. */
export function repeatShort(p: Pick<PersonalEvent, 'repeat' | 'date'>): string | null {
  if (p.repeat === 'none') return null;
  return p.repeat === 'weekly' ? `${weekdayOf(parseDay(p.date)).long}s` : 'Every day';
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
  e: Pick<CalendarEvent, 'id' | 'moduleId' | 'type' | 'mine'>,
  prefs: CalendarPrefs | null | undefined,
): boolean {
  if (!prefs || e.mine) return false;
  return (
    prefs.hiddenEvents.includes(e.id) ||
    prefs.hiddenTypes.includes(e.type) ||
    (!!e.moduleId && prefs.hiddenModules.includes(e.moduleId))
  );
}

/** The programme dates on the student's calendar, and their own events' occurrences, by date. */
export function myCalendar(
  programme: readonly CalendarEvent[],
  mine: readonly PersonalEvent[],
  prefs: CalendarPrefs | null | undefined,
): CalendarEvent[] {
  const shown = programme.filter((e) => !isHidden(e, prefs));
  if (!mine.length) return shown;
  return [...shown, ...occurrences(mine)].sort((a, b) => a.date.localeCompare(b.date));
}

// ── one day on the month grid ─────────────────────────────────────────────────────────────────

/**
 * The order of a day's events on the month grid, where only the first few fit: what starts that day before what
 * runs on from an earlier day (a window, a break); of those, exams and deadlines, then the student's own events by
 * start time (all-day ones first), then the other programme dates. Ties keep the order they came in.
 */
export function dayOrder(events: readonly CalendarEvent[], day: DayKey): CalendarEvent[] {
  const rank = (e: CalendarEvent): number =>
    e.date < day ? 3 : e.mine ? 1 : e.type === 'exam' || e.type === 'deadline' ? 0 : 2;
  const at = (e: CalendarEvent): string => e.mine?.startTime ?? '';
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e) - rank(b.e) || at(a.e).localeCompare(at(b.e)) || a.i - b.i)
    .map(({ e }) => e);
}
