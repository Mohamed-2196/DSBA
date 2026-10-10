// iCalendar (RFC 5545) files built in the browser for "Add to calendar": all-day events, CRLF line
// endings, 75-octet line folding, escaped text. Exams and deadlines carry a reminder at 09:00 the day
// before. A published time or place goes into the notes (and LOCATION); a sample date says so in its
// notes. (The subscribable feed of the whole calendar is served by the API: /api/v1/calendar/feed.ics.)
import type { ModuleSummary } from '../../api/types';
import { cohortLabel } from '../../state';
import { addDays, formatLong, parseKey, toKey } from './dates';
import { typeLabel } from './eventMeta';
import type { CalendarEvent } from './types';

type ModuleLookup = (id: string | null | undefined) => ModuleSummary | null;

const CRLF = '\r\n';
const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const octets = (s: string): number => (encoder ? encoder.encode(s).length : s.length);

/** TEXT value escaping (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Fold a content line at 75 octets without splitting a UTF-8 character (§3.1). */
function fold(line: string): string {
  if (octets(line) <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = octets(ch);
    if (size + n > limit) {
      parts.push(cur);
      cur = '';
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join(`${CRLF} `);
}

const dateValue = (key: string): string => key.replace(/-/g, '');
const utcStamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Absolute link to an event on the calendar page. */
export function eventUrl(event: Pick<CalendarEvent, 'id'>): string {
  return new URL(`${import.meta.env.BASE_URL}calendar?event=${encodeURIComponent(event.id)}`, window.location.origin).href;
}

function describe(event: CalendarEvent, getModule: ModuleLookup): string {
  const module = getModule(event.moduleId);
  const when = event.endDate && event.endDate > event.date ? `${formatLong(parseKey(event.date))} to ${formatLong(parseKey(event.endDate))}` : formatLong(parseKey(event.date));
  const lines = [`${typeLabel(event.type)} for ${event.year ? cohortLabel(event.year) : 'all years'}, ${when}.`];
  if (module) lines.push(`Module: ${module.unitCode ? `${module.unitCode} ` : ''}${module.name}.`);
  if (event.time || event.place) lines.push(`${[event.time, event.place].filter(Boolean).join(', ')}.`);
  if (event.sample) lines.push('Sample date: it follows last year’s pattern and is not confirmed. Check with the programme office.');
  lines.push(event.time || event.place ? 'From the DSBA Hub calendar (all-day event).' : 'From the DSBA Hub calendar (all-day event; exam times and venues are not included).');
  return lines.join('\n');
}

function vevent(event: CalendarEvent, now: Date, getModule: ModuleLookup): string[] {
  const last = event.endDate && event.endDate > event.date ? event.endDate : event.date;
  const end = toKey(addDays(parseKey(last), 1)); // DTEND is exclusive for all-day events
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@dsba-hub`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${dateValue(event.date)}`,
    `DTEND;VALUE=DATE:${dateValue(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(describe(event, getModule))}`,
    ...(event.place ? [`LOCATION:${escapeText(event.place)}`] : []),
    `CATEGORIES:${escapeText(typeLabel(event.type))}`,
    `TRANSP:${event.type === 'exam' ? 'OPAQUE' : 'TRANSPARENT'}`,
    `URL:${eventUrl(event)}`,
  ];
  if (event.type === 'exam' || event.type === 'deadline') {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(`Tomorrow: ${event.title}`)}`,
      'TRIGGER:-PT15H', // 09:00 the day before an all-day event
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

/**
 * A complete .ics document for one or more events.
 * @param name  X-WR-CALNAME (calendar name shown on import)
 */
export function buildIcs(events: readonly CalendarEvent[], getModule: ModuleLookup, { name = 'DSBA Hub', now = new Date() }: { name?: string; now?: Date } = {}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DSBA Hub//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Asia/Bahrain',
    ...events.flatMap((e) => vevent(e, now, getModule)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

/** Safe file name, e.g. 'ST2134-exam-2026-10-23.ics'. */
export function icsFileName(event: CalendarEvent): string {
  const head = event.unitCode || event.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
  return `${head}-${event.type}-${event.date}.ics`;
}

/** Download text as a file. Returns true when the browser accepted the download. */
export function downloadIcs(fileName: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}
