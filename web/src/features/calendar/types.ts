// Shapes of the calendar feature. Programme dates come from the API (GET /api/v1/calendar/events); a student's own
// events from GET /api/v1/calendar/mine/events, laid out as occurrences (mine.ts).
import type {
  AgendaCard,
  CalendarEventCreate,
  CalendarEventOut,
  CalendarEventUpdate,
  CalendarPrefsOut,
  PersonalEventCreate,
  PersonalEventOut,
  PersonalEventUpdate,
} from '../../api/types';
import type { CohortYear } from '../../state';

/** One of a student's own events, as stored: a repeat is one event. */
export type PersonalEvent = PersonalEventOut;
export type PersonalInput = PersonalEventCreate;
export type PersonalPatch = PersonalEventUpdate;
export type PersonalColour = PersonalEventOut['colour'];
export type Repeat = PersonalEventOut['repeat'];
export type Reminder = NonNullable<PersonalEventOut['remind']>;
/** What a change or a deletion made from one day of a repeat covers: that day, it and the later ones, or all of it. */
export type ChangeScope = 'one' | 'following' | 'all';
/** The scopes the API's occurrence routes take ('all' is the event itself). */
export type DayScope = Exclude<ChangeScope, 'all'>;
export type CalendarPrefs = CalendarPrefsOut;
/** A card of the student's boards with a day of its own: their plan, shown on their calendar while they want it. */
export type PlanCard = AgendaCard;

/**
 * One date on the calendar: { id, date: 'YYYY-MM-DD', endDate, title, type, year (null = everyone),
 * moduleId, unitCode, time, place (free text, only when the organiser published them),
 * sample (true: not confirmed yet; students see it marked so), resit (an exam's resit sitting: for the year after
 * the module's and those resitting it, never the module's own year) }.
 * `mine`: one occurrence of the student's own event (its id is 'mine-<event id>', with '-<date>' for a repeat);
 * every other field is filled from it, so lists, the grid and the drawer take both.
 * `plan`: a card of the student's plan on its day (its id is 'plan-<card id>'), filled the same way.
 */
export type CalendarEvent = CalendarEventOut & { mine?: PersonalEvent; plan?: PlanCard };
export type EventType = CalendarEventOut['type'];
export type EventInput = CalendarEventCreate;
export type EventPatch = CalendarEventUpdate;

/** A filter chip: a programme type, the student's own events, or their plan. */
export type EventFilter = EventType | 'mine' | 'plan';

/** Query filters for GET /calendar/events (all optional). */
export interface EventFilters {
  /** 'YYYY-MM-DD', inclusive. */
  from?: string;
  /** 'YYYY-MM-DD', inclusive. */
  to?: string;
  year?: CohortYear | null;
  moduleId?: string | null;
  type?: EventType | null;
  /** The modules the student is resitting: with `year`, their resits come too (module ids). */
  resits?: readonly string[];
}

export interface EventTypeMeta {
  label: string;
  /** its dates together, inside a sentence ('mock exams') */
  plural: string;
  /** The CSS token the type is drawn with. */
  token: string;
  color: string;
}
