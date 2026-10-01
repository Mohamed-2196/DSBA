// Presentation helpers for calendar events (shared by the page, the drawer and UpcomingEvents).
import { EVENT_TYPES } from '../../data/calendar.js';
import { getModule } from '../../data/modules.js';

/** Legend / filter order. */
export const TYPE_ORDER = ['exam', 'mock', 'revision', 'deadline', 'break', 'term'];

/** Badge tone per type (ui Badge tones). */
export const TYPE_BADGE_TONE = { exam: 'alert', mock: 'cobalt', revision: 'signal', deadline: 'highlight', break: 'neutral', term: 'neutral', thanks: 'highlight' };

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
 * Text for a grid chip: { code, line }. Exams read as code + module ("ST2134", "Statistical inference");
 * everything else as code + what happens ("ST1215", "First day of Stats MCQ on VLE").
 */
export function chipText(e) {
  const m = eventModule(e);
  if (!e.unitCode) return { code: null, line: e.title };
  if (e.type === 'exam') return { code: e.unitCode, line: m ? m.shortName : splitTitle(e).rest };
  return { code: e.unitCode, line: splitTitle(e).rest };
}

/** Screen-reader summary of an event. */
export function eventSummary(e) {
  return `${e.title}, ${typeLabel(e.type)}${e.year ? `, Year ${e.year}` : ', all years'}`;
}
