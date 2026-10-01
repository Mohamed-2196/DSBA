// Public API of the calendar feature. Signatures are a contract — do not change them.
//   UpcomingEvents({ n = 5 })                          compact "coming up" list (Home, forum sidebar);
//                                                      each row links to /calendar?event=<id>
//   getUpcomingEvents({ year, from = new Date(), n = 5 }) -> CalendarEvent[] (year null → all years)
//   getNextExamForModule(moduleId)                     -> CalendarEvent | null
// Deep links into the page: /calendar?event=<id> (opens the event), ?month=YYYY-MM, ?cohort=all,
// ?types=exam,mock (comma list of EVENT_TYPES keys).
export { UpcomingEvents } from './UpcomingEvents.jsx';
export { getUpcomingEvents, getNextExamForModule } from './queries.js';
