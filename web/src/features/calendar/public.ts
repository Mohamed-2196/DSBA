// Public API of the calendar feature. Other features import from here only.
//
//   <UpcomingEvents n={5} />                 compact "coming up" list for the student's cohort (Home, forum sidebar);
//                                            each row links to /calendar?event=<id>. Has its own loading/empty/error states.
//   useUpcomingEvents({ n, year })           UseQueryResult<CalendarEvent[]>: the next n dates from today for a cohort
//                                            (plus everyone-dates); year null → every cohort.
//   useNextExamForModule(moduleId)           UseQueryResult<CalendarEvent | null>: the module's next exam, null when none.
//   useCalendarEvents({ from, to, year, moduleId, type })   UseQueryResult<CalendarEvent[]>, oldest first.
//
//   eventDate(e) / dayKeyFromToday(n)        an event's day as a local Date; 'YYYY-MM-DD' n days from today.
//
// Deep links into the page: /calendar?event=<id> (opens the event), ?month=YYYY-MM, ?cohort=all,
// ?types=exam,mock (comma list of event types).
export { UpcomingEvents } from './UpcomingEvents';
export type { UpcomingEventsProps } from './UpcomingEvents';
export { CALENDAR_KEY, feedUrl, useCalendarEvents, useNextExamForModule, useUpcomingEvents } from './api';
export { daysUntil, formatLong, formatLongDay, formatMonthShort, formatShort } from './dates';
export { EVENT_TYPES, TYPE_ORDER, typeLabel } from './eventMeta';
export { dayKeyFromToday, eventDate } from './queries';
export type { CalendarEvent, EventFilters, EventType } from './types';
