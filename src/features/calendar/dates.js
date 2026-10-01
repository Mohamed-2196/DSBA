// Calendar date helpers. Events are calendar days ('YYYY-MM-DD', no time zone) and are compared as
// local midnights, so a countdown counts calendar days whatever the hour (the launch film freezes the
// clock at 2026-10-06 10:00 Asia/Bahrain: ST2134 on 23 Oct is "17 days" away all day).

export const DAY_MS = 86400000;

/** Weekday headers, Sunday first (the Bahraini week; v1 also started on Sunday). */
export const WEEKDAYS = [
  { short: 'Sun', long: 'Sunday' },
  { short: 'Mon', long: 'Monday' },
  { short: 'Tue', long: 'Tuesday' },
  { short: 'Wed', long: 'Wednesday' },
  { short: 'Thu', long: 'Thursday' },
  { short: 'Fri', long: 'Friday' },
  { short: 'Sat', long: 'Saturday' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Friday and Saturday are the weekend in Bahrain. */
export const isWeekend = (date) => date.getDay() === 5 || date.getDay() === 6;

const pad = (n) => String(n).padStart(2, '0');

/** Local midnight of a Date / timestamp / 'YYYY-MM-DD'. */
export function startOfDay(input = new Date()) {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return parseKey(input);
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 'YYYY-MM-DD' for a local date. */
export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight Date for 'YYYY-MM-DD'. */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole calendar days from `from` to `date` (negative = in the past). */
export function daysUntil(date, from = new Date()) {
  return Math.round((startOfDay(date).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** 'Today', 'Tomorrow', 'In 17 days', 'Yesterday', '3 days ago'; more than a month back: 'Past'. */
export function countdownLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < -30) return 'Past';
  return days > 1 ? `In ${days} days` : `${-days} days ago`;
}

/** Compact form for tight lists: 'Today' · 'Tomorrow' · '17 days' · 'Past'. */
export function countdownShort(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 0) return 'Past';
  return `${days} days`;
}

// ── Months ──────────────────────────────────────────────────────────────────────────────────────
/** 'YYYY-MM' for a Date. */
export const monthKeyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

/** { y, m } (m 0-based) from 'YYYY-MM', or null when malformed. */
export function parseMonthKey(key) {
  const match = typeof key === 'string' && /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  return m >= 0 && m <= 11 && y > 1900 && y < 3000 ? { y, m } : null;
}

export function addMonths({ y, m }, n) {
  const d = new Date(y, m + n, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

export const monthKey = ({ y, m }) => `${y}-${pad(m + 1)}`;
export const sameMonth = (a, b) => a.y === b.y && a.m === b.m;
export const monthOfDate = (date) => ({ y: date.getFullYear(), m: date.getMonth() });

/** 'October 2026' */
export const monthTitle = ({ y, m }) => `${MONTHS[m]} ${y}`;
/** 'October' */
export const monthName = ({ m }) => MONTHS[m];

/** Weeks (arrays of 7 local Dates, Sunday first) covering a month. */
export function monthMatrix({ y, m }) {
  const lead = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks = [];
  for (let i = 0; i < cells; i += 1) {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(new Date(y, m, 1 - lead + i));
  }
  return weeks;
}

export const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

// ── Formatting (en-GB order, built by hand so no locale adds commas or 'Sept') ──────────────────
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'Friday 23 October 2026' */
export const formatLong = (date) => `${WEEKDAYS[date.getDay()].long} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
/** 'Fri 23 Oct' */
export const formatShort = (date) => `${WEEKDAYS[date.getDay()].short} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
/** '23 Oct' */
export const formatDayMonth = (date) => `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
/** '23 October' */
export const formatDayMonthLong = (date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;
/** 'Fri' */
export const formatWeekday = (date) => WEEKDAYS[date.getDay()].short;
/** 'October 2026' */
export const formatMonthYear = (date) => `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
