// Date helpers for Home. Everything is computed from Date.now() (the launch film freezes the clock).
const DAY = 86400000;

/** Local midnight of a Date / timestamp. */
export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole calendar days from a to b (b later → positive). */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

/** 'Good morning' | 'Good afternoon' | 'Good evening' for the local hour. */
export function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** 'in 17 days' | 'tomorrow' | 'today'. */
export function inDays(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** 'Tuesday 6 October' (en-GB). */
export function longDay(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** '23 Oct'. */
export function shortDay(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** 'YYYY-MM-DD' for a local Date (not UTC). */
export function isoDay(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Local Date for a 'YYYY-MM-DD' calendar day. */
export function dayFromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** 'six' for 6 (≤ 10), digits above. */
export function numberWord(n) {
  return WORDS[n] ?? String(n);
}
