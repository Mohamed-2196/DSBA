// Public API of the calendar feature. Other features import from here only.
//
//   <UpcomingEvents n={5} year? />           compact "coming up" list for the student's cohort (Home, forum sidebar);
//                                            each row links to /calendar?event=<id>. Has its own loading/empty/error states.
//                                            `year` overrides the browsed cohort (Home passes the year its other panels show).
//   useUpcomingEvents({ n, year })           UseQueryResult<CalendarEvent[]>: the next n dates from today for a cohort
//                                            (plus everyone-dates); year null → every cohort.
//   useNextExamForModule(moduleId, { enabled }) UseQueryResult<CalendarEvent | null>: the module's next exam, null when none.
//   useCalendarEvents({ from, to, year, moduleId, type })   UseQueryResult<CalendarEvent[]>, oldest first.
//
//   eventDate(e) / dayKeyFromToday(n)        an event's day as a local Date; 'YYYY-MM-DD' n days from today (Bahrain).
//
// Deep links into the page: /calendar?event=<id> (opens the event), ?month=YYYY-MM (the month grid), ?cohort=all,
// ?types=exam,mock (comma list of event types), ?view=month (phones and tablets: the month instead of the list).
export { UpcomingEvents } from './UpcomingEvents';
export type { UpcomingEventsProps } from './UpcomingEvents';
export { CALENDAR_KEY, feedUrl, useCalendarEvents, useNextExamForModule, useUpcomingEvents } from './api';
export { EVENT_TYPES, TYPE_ORDER, typeLabel } from './eventMeta';
export { dayKeyFromToday, eventDate } from './queries';
export type { CalendarEvent, EventFilters, EventType } from './types';
