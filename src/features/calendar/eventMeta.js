// Presentation helpers for calendar events (shared by the page, the drawer and UpcomingEvents).
import { EVENT_TYPES } from '../../data/calendar.js';
import { getModule } from '../../data/modules.js';

/** Legend / filter order. Also the order of importance when one day holds several events. */
export const TYPE_ORDER = ['exam', 'mock', 'revision', 'deadline', 'event', 'break', 'term'];

/** Badge tone per type (ui Badge tones; 'event' is tinted amber by the calendar's own CSS). */
export const TYPE_BADGE_TONE = { exam: 'alert', mock: 'cobalt', revision: 'signal', deadline: 'highlight', event: 'neutral', break: 'neutral', term: 'neutral', thanks: 'highlight' };

export const typeLabel = (type) => EVENT_TYPES[type]?.label || (type === 'thanks' ? 'Teacher’s Day' : 'Event');

/**
 * Easter egg for the launch (spec §0): only exists on /calendar?for=tutors. Never on default views,
 * never in UpcomingEvents. A thank-you from the students, attributed to no one in particular.
 */
export const THANKS_EVENT = {
  id: '2026-10-06-teachers-day',
  date: '2026-10-06',
  title: 'Teacher’s Day: thank you',
  type: 'thanks',
  year: null,
  moduleId: null,
  unitCode: null,
};

/** The module an event belongs to, or null. */
export const eventModule = (e) => (e?.moduleId ? getModule(e.moduleId) : null);

/**
 * Title split for typographic display: { code: 'ST2134', rest: 'Advanced Statistics: … (October exam)' }.
 * code is null when the event has no unit code or the title doesn't start with it.
 */
export function splitTitle(e) {
  if (e.unitCode && e.title.startsWith(`${e.unitCode} `)) return { code: e.unitCode, rest: e.title.slice(e.unitCode.length + 1) };
  return { code: null, rest: e.title };
}

/**
 * What happens, without repeating the module the unit code already names:
 * 'Statistical Inference revision session' → 'Revision session', 'Business mock exam' → 'Mock exam'.
 * Titles that don't start with their module's name are left alone.
 */
function whatHappens(e, m) {
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
export function chipText(e) {
  const m = eventModule(e);
  if (!e.unitCode) return { code: null, line: e.title };
  if (e.type === 'exam') return { code: e.unitCode, line: m ? m.shortName : splitTitle(e).rest };
  return { code: e.unitCode, line: whatHappens(e, m) };
}

/** The most important of a day's events (exams first, then in TYPE_ORDER; ties keep calendar order). */
export function primaryEvent(events) {
  const rank = (e) => {
    const i = TYPE_ORDER.indexOf(e.type);
    return i < 0 ? TYPE_ORDER.length : i;
  };
  return events.reduce((best, e) => (rank(e) < rank(best) ? e : best), events[0]);
}

const STRIP_WORDS = { mock: 'Mock', revision: 'Revision', deadline: 'Deadline', event: 'Event', break: 'Break', term: 'Term date' };

/**
 * The word under a day on the strip: exams by their unit code ('ST2134'), everything else by what
 * it is ('Revision', 'Mock', 'Deadline'…), so a mark is never identified by its colour alone.
 */
export function stripWord(e) {
  if (e.type === 'exam') return e.unitCode || eventModule(e)?.shortName || 'Exam';
  return STRIP_WORDS[e.type] || typeLabel(e.type);
}

const NAMED_BY_MODULE = new Set(['exam', 'mock', 'revision']);

/**
 * Text for a date card: { code, name }.
 * An exam, a mock or a revision session reads as code + module ('ST2134', 'Statistical inference'):
 * the card's type line says which of the three it is. Anything else attached to a module keeps its
 * own words ('EC2020', 'Last day of Econometrics MCQ on VLE'). Events without a unit code (Year 3
 * modules, programme events, term dates) read as their title.
 */
export function cardText(e) {
  if (!e.unitCode) return { code: null, name: e.title };
  const m = eventModule(e);
  return { code: e.unitCode, name: m && NAMED_BY_MODULE.has(e.type) ? m.shortName : splitTitle(e).rest };
}

/** '12:30 PM, Auditorium' when the organiser published a time or a place, else null. */
export const timeAndPlace = (e) => [e.time, e.place].filter(Boolean).join(', ') || null;

/** Screen-reader summary of an event. */
export function eventSummary(e) {
  return `${e.title}, ${typeLabel(e.type)}${e.year ? `, Year ${e.year}` : ', all years'}`;
}
