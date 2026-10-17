// Public API of the calendar feature. Other features import from here only.
//
//   <UpcomingEvents n={5} year? />           compact "coming up" list for the student's cohort (Home, forum sidebar),
//                                            less the dates they hid, with their own events;
//                                            each row links to /calendar?event=<id>. Has its own loading/empty/error states.
//                                            `year` overrides the browsed cohort (Home passes the year its other panels show).
//   useNextExamForModule(moduleId, { enabled }) UseQueryResult<CalendarEvent | null>: the module's next exam, null when none.
//   useCalendarEvents({ from, to, year, moduleId, type })   UseQueryResult<CalendarEvent[]>, oldest first.
//   useMyCalendarEvents(filters, { enabled })  the same, less the dates the signed-in student hid from their own
//                                            calendar (their Home); it waits for their settings.
//
//   applicationLine(e, today)                a careers date on an employer's card: 'Opens in January', 'Closes 30 November'.
//   eventDate(e) / dayKeyFromToday(n)        an event's day as a local Date; 'YYYY-MM-DD' n days from today (Bahrain).
//
// Deep links into the page: /calendar?event=<id> (opens the event; 'mine-<id>' one of the student's own),
// ?month=YYYY-MM (the month grid), ?cohort=all, ?types=exam,mock (comma list of event types; 'mine' for their own),
// ?view=month (phones and tablets: the month instead of the list).
export { UpcomingEvents } from './UpcomingEvents';
//   <EventFormDialog open event preset? onClose onSaved />   add or edit a date (holders of calendar.manage);
//                                            `preset` fills a new one (Career Navigator's editor: a careers date).
export { EventFormDialog } from './EventFormDialog';
export { useCalendarEvents, useNextExamForModule } from './api';
export { useMyCalendarEvents } from './useMyCalendar';
export { applicationLine, EVENT_TYPES, TYPE_ORDER, typeLabel } from './eventMeta';
export { dayKeyFromToday, eventDate } from './queries';
export type { CalendarEvent, EventType } from './types';
