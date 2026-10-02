// Career Navigator: day maths for deadlines. Everything is a calendar day, so a clock frozen at 10:00 and one
// at 23:00 agree.

/** A new Date `n` calendar days after `base` (midnight). */
export function addDays(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

/** Month and day for a deadline: '14 Oct'. */
export function shortDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Whole days from `from` to `date`, both read as calendar days. */
export function daysBetween(from, date) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

/** 'today', 'tomorrow' or 'in 12 days'. */
export function relativeDays(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
