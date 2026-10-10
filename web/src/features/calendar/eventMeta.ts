// Presentation helpers for calendar events (shared by the page, the drawer and UpcomingEvents).
// Pure functions: the module an event belongs to is passed in (useModules().getModule in components).
import type { ModuleSummary } from '../../api/types';
import type { CalendarEvent, EventType, EventTypeMeta } from './types';

export const EVENT_TYPES: Record<EventType, EventTypeMeta> = {
  exam: { label: 'Exam', token: '--alert', color: 'var(--alert)' },
  mock: { label: 'Mock exam', token: '--cobalt', color: 'var(--cobalt)' },
  revision: { label: 'Revision', token: '--signal', color: 'var(--signal)' },
  deadline: { label: 'Deadline', token: '--highlight', color: 'var(--highlight)' },
  // Programme events (Speech Day, launches, socials). Amber is the one warm token the other types leave free; it is
  // also Year 3's cohort colour, so it never appears without the word "Event".
  event: { label: 'Event', token: '--y3', color: 'var(--y3)' },
  break: { label: 'Break', token: '--ink-3', color: 'var(--ink-3)' },
  term: { label: 'Term dates', token: '--ink-2', color: 'var(--ink-2)' },
};

/** Legend / filter order. Also the order of importance when one day holds several events. */
export const TYPE_ORDER: readonly EventType[] = ['exam', 'mock', 'revision', 'deadline', 'event', 'break', 'term'];

export const isEventType = (value: unknown): value is EventType => typeof value === 'string' && value in EVENT_TYPES;

export type BadgeTone = 'neutral' | 'cobalt' | 'signal' | 'alert' | 'highlight';

/** Badge tone per type (ui Badge tones; 'event' is tinted amber by the calendar's own CSS). */
export const TYPE_BADGE_TONE: Record<EventType, BadgeTone> = {
  exam: 'alert',
  mock: 'cobalt',
  revision: 'signal',
  deadline: 'highlight',
  event: 'neutral',
  break: 'neutral',
  term: 'neutral',
};

export const typeLabel = (type: string): string => (isEventType(type) ? EVENT_TYPES[type].label : 'Event');

export type ModuleLookup = (id: string | null | undefined) => ModuleSummary | null;

/**
 * Title split for typographic display: { code: 'ST2134', rest: 'Advanced Statistics: … (October exam)' }.
 * code is null when the event has no unit code or the title doesn't start with it.
 */
export function splitTitle(e: Pick<CalendarEvent, 'unitCode' | 'title'>): { code: string | null; rest: string } {
  if (e.unitCode && e.title.startsWith(`${e.unitCode} `)) return { code: e.unitCode, rest: e.title.slice(e.unitCode.length + 1) };
  return { code: null, rest: e.title };
}

/**
 * What happens, without repeating the module the unit code already names:
 * 'Statistical Inference revision session' → 'Revision session', 'Business mock exam' → 'Mock exam'.
 * Titles that don't start with their module's name are left alone.
 */
function whatHappens(e: CalendarEvent, m: ModuleSummary | null): string {
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
export function chipText(e: CalendarEvent, m: ModuleSummary | null): { code: string | null; line: string } {
  if (!e.unitCode) return { code: null, line: e.title };
  if (e.type === 'exam') return { code: e.unitCode, line: m ? m.shortName : splitTitle(e).rest };
  return { code: e.unitCode, line: whatHappens(e, m) };
}

/** The most important of a day's events (exams first, then in TYPE_ORDER; ties keep calendar order). */
export function primaryEvent<T extends Pick<CalendarEvent, 'type'>>(events: readonly T[]): T | undefined {
  const rank = (e: T): number => {
    const i = TYPE_ORDER.indexOf(e.type);
    return i < 0 ? TYPE_ORDER.length : i;
  };
  let best: T | undefined;
  for (const e of events) if (!best || rank(e) < rank(best)) best = e;
  return best;
}

const STRIP_WORDS: Partial<Record<EventType, string>> = {
  mock: 'Mock',
  revision: 'Revision',
  deadline: 'Deadline',
  event: 'Event',
  break: 'Break',
  term: 'Term date',
};

/**
 * The word under a day on the strip: exams by their unit code ('ST2134'), everything else by what
 * it is ('Revision', 'Mock', 'Deadline'…), so a mark is never identified by its colour alone.
 */
export function stripWord(e: CalendarEvent, m: ModuleSummary | null): string {
  if (e.type === 'exam') return e.unitCode || m?.shortName || 'Exam';
  return STRIP_WORDS[e.type] ?? typeLabel(e.type);
}

const NAMED_BY_MODULE = new Set<EventType>(['exam', 'mock', 'revision']);

/**
 * Text for a date card: { code, name }.
 * An exam, a mock or a revision session reads as code + module ('ST2134', 'Statistical inference'):
 * the card's type line says which of the three it is. Anything else attached to a module keeps its
 * own words ('EC2020', 'Last day of Econometrics MCQ on VLE'). Events without a unit code (Year 3
 * modules, programme events, term dates) read as their title.
 */
export function cardText(e: CalendarEvent, m: ModuleSummary | null): { code: string | null; name: string } {
  if (!e.unitCode) return { code: null, name: e.title };
  return { code: e.unitCode, name: m && NAMED_BY_MODULE.has(e.type) ? m.shortName : splitTitle(e).rest };
}

/** '12:30 PM, Auditorium' when the organiser published a time or a place, else null. */
export const timeAndPlace = (e: Pick<CalendarEvent, 'time' | 'place'>): string | null => [e.time, e.place].filter(Boolean).join(', ') || null;

/** Screen-reader summary of an event. */
export function eventSummary(e: CalendarEvent): string {
  return `${e.title}, ${typeLabel(e.type)}${e.year ? `, Year ${e.year}` : ', all years'}`;
}

/** Does an event apply to a cohort? Everyone-events (year null) apply to every cohort; year null → all. */
export const appliesTo = (e: Pick<CalendarEvent, 'year'>, year: number | null | undefined): boolean =>
  year == null || e.year == null || e.year === Number(year);
