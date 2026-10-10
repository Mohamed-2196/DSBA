// Shapes of the calendar feature. Events come from the API (GET /api/v1/calendar/events).
import type { CalendarEventCreate, CalendarEventOut, CalendarEventUpdate } from '../../api/types';
import type { CohortYear } from '../../lib/modules';

/**
 * One date on the calendar: { id, date: 'YYYY-MM-DD', endDate, title, type, year (null = everyone),
 * moduleId, unitCode, time, place (free text, only when the organiser published them),
 * sample (a placeholder date, not confirmed yet) }.
 */
export type CalendarEvent = CalendarEventOut;
export type EventType = CalendarEventOut['type'];
export type EventInput = CalendarEventCreate;
export type EventPatch = CalendarEventUpdate;

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

/** The next exam and the rest of its session (see queries.ts getExamOutlook). */
export interface ExamOutlook {
  next: CalendarEvent;
  ahead: CalendarEvent[];
  started: boolean;
}
