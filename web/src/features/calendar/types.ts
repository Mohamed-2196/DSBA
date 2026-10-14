// Shapes of the calendar feature. Programme dates come from the API (GET /api/v1/calendar/events); a student's own
// events from GET /api/v1/calendar/mine/events, laid out as occurrences (mine.ts).
import type { CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, CalendarPrefsOut, PersonalEventCreate, PersonalEventOut, PersonalEventUpdate } from '../../api/types';
import type { CohortYear } from '../../state';

/** One of a student's own events, as stored: a repeat is one event. */
export type PersonalEvent = PersonalEventOut;
export type PersonalInput = PersonalEventCreate;
export type PersonalPatch = PersonalEventUpdate;
export type PersonalColour = PersonalEventOut['colour'];
export type Repeat = PersonalEventOut['repeat'];
export type Reminder = NonNullable<PersonalEventOut['remind']>;
export type CalendarPrefs = CalendarPrefsOut;

/**
 * One date on the calendar: { id, date: 'YYYY-MM-DD', endDate, title, type, year (null = everyone),
 * moduleId, unitCode, time, place (free text, only when the organiser published them),
 * sample (true: not confirmed yet; students see it marked so) }.
 * `mine`: one occurrence of the student's own event (its id is 'mine-<event id>', with '-<date>' for a repeat);
 * every other field is filled from it, so lists, the grid and the drawer take both.
 */
export type CalendarEvent = CalendarEventOut & { mine?: PersonalEvent };
export type EventType = CalendarEventOut['type'];
export type EventInput = CalendarEventCreate;
export type EventPatch = CalendarEventUpdate;

/** A filter chip: a programme type, or the student's own events. */
export type EventFilter = EventType | 'mine';

/** Query filters for GET /calendar/events (all optional). */
export interface EventFilters {
  /** 'YYYY-MM-DD', inclusive. */
  from?: string;
  /** 'YYYY-MM-DD', inclusive. */
  to?: string;
  year?: CohortYear | null;
  moduleId?: string | null;
  type?: EventType | null;
}

export interface EventTypeMeta {
  label: string;
  /** The CSS token the type is drawn with. */
  token: string;
  color: string;
}
