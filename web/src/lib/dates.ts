// Calendar days: keys, today in Bahrain, distances and formats.
//
// A day on the calendar, an issue date or an exam is a DayKey: 'YYYY-MM-DD', with no time and no time zone. In code
// a day is a Date at local midnight of that day (parseDay), so its year, month and date read back as written,
// whatever zone the device is in. Day arithmetic goes through UTC dates, so a daylight-saving change on the
// device never makes a day 23 or 25 hours long.
//
// "Today" is Bahrain's today, as the API counts it (app.core.time.bahrain_today): a laptop set to UTC would
// otherwise be a day behind from midnight to 3 am in Manama.
//
// Names of months and weekdays are written by hand: no locale turns September into "Sept" or adds commas.

/** A calendar day: 'YYYY-MM-DD' (the API's `date` fields). */
export type DayKey = string;

/** A day given as a Date or a timestamp (its day on this device) or as a day key. */
export type DayInput = Date | number | DayKey;

export const DAY_MS = 86_400_000;
export const TIME_ZONE = 'Asia/Bahrain';

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written as 'YYYY-MM-DD' ('2026-02-30' is not one). */
export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false;
  const m = DAY_KEY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The day a Date falls on, on this device: '2026-10-23'. */
export function dayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a day key ('2026-10-23' → 23 Oct 2026, 00:00). A malformed key reads as 1 Jan 1970. */
export function parseDay(key: DayKey): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(Number.isFinite(y) ? y : 1970, (Number.isFinite(m) ? m : 1) - 1, Number.isFinite(d) ? d : 1);
}

const bahrainDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today in Bahrain, as a day key: what the API calls today, whatever zone this device is set to. */
export function todayKey(now: Date | number = Date.now()): DayKey {
  const parts = bahrainDay.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Today in Bahrain, at local midnight. */
export function today(now: Date | number = Date.now()): Date {
  return parseDay(todayKey(now));
}

/** Local midnight of a Date, a timestamp or a day key. Without an argument: today (in Bahrain). */
export function startOfDay(input?: DayInput): Date {
  if (input === undefined) return today();
  if (typeof input === 'string') return parseDay(input);
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

const utcDay = (day: DayInput): number => {
  const d = typeof day === 'string' ? parseDay(day) : new Date(day);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/** Whole calendar days from `from` to `to`: positive when `to` is later ('2026-10-06' → '2026-10-23' is 17). */
export function daysBetween(from: DayInput, to: DayInput): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

/** Whole calendar days from `from` (today in Bahrain) until `day`: 0 today, 1 tomorrow, negative in the past. */
export function daysUntil(day: DayInput, from: DayInput = today()): number {
  return daysBetween(from, day);
}

/** The day `n` days after `date` (before, for a negative n), at local midnight. */
export function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/** The day key `n` days after `key`. */
export function addDaysToKey(key: DayKey, n: number): DayKey {
  return dayKey(addDays(parseDay(key), n));
}

/** 'today', 'tomorrow', 'in 17 days', inside a sentence (for days that are today or later). */
export function inDays(days: number): string {
  if (days <= 0) return 'today';
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** 'today', 'tomorrow', 'yesterday', 'in 13 days', '3 days ago'. */
export function relativeDays(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

// ── Names ────────────────────────────────────────────────────────────────────────────────────────

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface Weekday {
  short: string;
  long: string;
  two: string;
  one: string;
}

/** Weekdays, Sunday first (the Bahraini week starts on Sunday; Friday and Saturday are the weekend). */
export const WEEKDAYS: readonly Weekday[] = [
  { short: 'Sun', long: 'Sunday', two: 'Su', one: 'S' },
  { short: 'Mon', long: 'Monday', two: 'Mo', one: 'M' },
  { short: 'Tue', long: 'Tuesday', two: 'Tu', one: 'T' },
  { short: 'Wed', long: 'Wednesday', two: 'We', one: 'W' },
  { short: 'Thu', long: 'Thursday', two: 'Th', one: 'T' },
  { short: 'Fri', long: 'Friday', two: 'Fr', one: 'F' },
  { short: 'Sat', long: 'Saturday', two: 'Sa', one: 'S' },
];

/** 'October' for month 9 (0-based). */
export const monthName = (month: number): string => MONTHS[month] ?? '';
/** 'Oct' for month 9 (0-based): never 'Sept'. */
export const monthShort = (month: number): string => MONTHS_SHORT[month] ?? '';

/** The weekday of a date. */
export const weekdayOf = (date: Date): Weekday => WEEKDAYS[date.getDay()] ?? { short: '', long: '', two: '', one: '' };

/** Friday and Saturday are the weekend in Bahrain. */
export const isWeekend = (date: Date): boolean => date.getDay() === 5 || date.getDay() === 6;

// ── Formatting (en-GB order) ───────────────────────────────────────────────────────────────────────

export interface DayFormat {
  /** 'Friday' or 'Fri' before the date; none by default */
  weekday?: 'long' | 'short';
  /** 'October' (default) or 'Oct' */
  month?: 'long' | 'short';
  /** add the year (default true) */
  year?: boolean;
}

/** '23 October 2026', 'Fri 23 Oct', 'Friday 23 October 2026': day first, no commas, months written by hand. */
export function formatDay(day: Date | DayKey, { weekday, month = 'long', year = true }: DayFormat = {}): string {
  const d = typeof day === 'string' ? parseDay(day) : day;
  const parts: string[] = [];
  if (weekday) parts.push(weekday === 'long' ? weekdayOf(d).long : weekdayOf(d).short);
  parts.push(String(d.getDate()), month === 'long' ? monthName(d.getMonth()) : monthShort(d.getMonth()));
  if (year) parts.push(String(d.getFullYear()));
  return parts.join(' ');
}

/** 'Friday 23 October 2026' */
export const formatLong = (date: Date): string => formatDay(date, { weekday: 'long' });
/** 'Friday 23 October' */
export const formatLongDay = (date: Date): string => formatDay(date, { weekday: 'long', year: false });
/** 'Fri 23 Oct' */
export const formatShort = (date: Date): string => formatDay(date, { weekday: 'short', month: 'short', year: false });
/** 'Fri 23 Oct 2026' */
export const formatShortYear = (date: Date): string => formatDay(date, { weekday: 'short', month: 'short' });
/** '23 Oct' */
export const formatDayMonth = (date: Date): string => formatDay(date, { month: 'short', year: false });
/** 'Oct' */
export const formatMonthShort = (date: Date): string => monthShort(date.getMonth());
/** 'October 2026' */
export const formatMonthYear = (date: Date): string => `${monthName(date.getMonth())} ${date.getFullYear()}`;

/** '09:05', '14:30': a moment's time of day on this device, 24-hour (a chat message's time). */
export const formatClock = (at: Date | number): string => {
  const d = typeof at === 'number' ? new Date(at) : at;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
