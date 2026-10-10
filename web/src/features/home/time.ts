// Date helpers for Home. Everything is computed from the clock at render time.
const DAY = 86400000;

/** Local midnight of a Date / timestamp. */
export function startOfDay(d: Date | number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole calendar days from a to b (b later → positive). */
export function daysBetween(a: Date | number, b: Date | number): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

/** 'Good morning' | 'Good afternoon' | 'Good evening' for the local hour. */
export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** 'in 17 days' | 'tomorrow' | 'today'. */
export function inDays(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** 'Tuesday 6 October' (en-GB). */
export function longDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '23 Oct' (built by hand, so September is never 'Sept'). */
export function shortDay(date: Date): string {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()] ?? ''}`;
}

/** 'YYYY-MM-DD' for a local Date (not UTC). */
export function isoDay(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Local Date for a 'YYYY-MM-DD' calendar day. */
export function dayFromISO(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** 'six' for 6 (≤ 10), digits above. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}
