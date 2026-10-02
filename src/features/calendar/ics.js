// iCalendar (RFC 5545) files built in the browser: all-day events, CRLF line endings, 75-octet line
// folding, escaped text. Exams and deadlines carry a reminder at 09:00 the day before.
import { getModule } from '../../data/modules.js';
import { EVENT_TYPES } from '../../data/calendar.js';
import { cohortLabel } from '../../state';
import { addDays, parseKey, toKey } from './dates.js';

const CRLF = '\r\n';
const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const octets = (s) => (encoder ? encoder.encode(s).length : s.length);

/** TEXT value escaping (RFC 5545 §3.3.11). */
function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Fold a content line at 75 octets without splitting a UTF-8 character (§3.1). */
function fold(line) {
  if (octets(line) <= 75) return line;
  const parts = [];
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

const dateValue = (key) => key.replace(/-/g, '');
const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Absolute link to an event on the calendar page (works on any deploy base). */
export function eventUrl(event) {
  if (typeof window === 'undefined') return null;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/calendar?event=${encodeURIComponent(event.id)}`;
}

function describe(event) {
  const type = EVENT_TYPES[event.type]?.label || 'Event';
  const module = getModule(event.moduleId);
  const lines = [`${type} for ${event.year ? cohortLabel(event.year) : 'all years'}.`];
  if (module) lines.push(`Module: ${module.unitCode ? `${module.unitCode} ` : ''}${module.name}.`);
  lines.push('From the DSBA Hub calendar (all-day event; exam times and venues are not included).');
  return lines.join('\n');
}

function vevent(event, now) {
  const start = event.date;
  const end = toKey(addDays(parseKey(event.date), 1)); // DTEND is exclusive for all-day events
  const url = eventUrl(event);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@dsba-hub`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${dateValue(start)}`,
    `DTEND;VALUE=DATE:${dateValue(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(describe(event))}`,
    `CATEGORIES:${escapeText(EVENT_TYPES[event.type]?.label || 'Event')}`,
    `TRANSP:${event.type === 'exam' ? 'OPAQUE' : 'TRANSPARENT'}`,
  ];
  if (url) lines.push(`URL:${url}`);
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
 * @param {CalendarEvent[]} events
 * @param {{ name?: string, now?: Date }} opts  name → X-WR-CALNAME (calendar name shown on import)
 */
export function buildIcs(events, { name = 'DSBA Hub', now = new Date() } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DSBA Hub//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Asia/Bahrain',
    ...events.flatMap((e) => vevent(e, now)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

/** Safe file name, e.g. 'ST2134-exam-2026-10-23.ics'. */
export function icsFileName(event) {
  const head = event.unitCode || event.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
  return `${head}-${event.type}-${event.date}.ics`;
}

/** Download text as a file. Returns true when the browser accepted the download. */
export function downloadIcs(fileName, text) {
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
