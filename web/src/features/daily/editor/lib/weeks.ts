// The schedule's weeks as the editor shows them: Sunday to Saturday, as the week runs in Bahrain.
import { addDaysToKey, monthShort, parseDay, type DayKey } from '../../../../lib/dates';

/** How far a week is from this one: 'This week', 'Next week', 'In 3 weeks'. */
export function weeksAway(n: number): string {
  if (n <= 0) return 'This week';
  return n === 1 ? 'Next week' : `In ${n} weeks`;
}

/** '18–24 Oct', or '25 Oct – 1 Nov' across two months. */
export function weekRange(start: DayKey): string {
  const s = parseDay(start);
  const e = parseDay(addDaysToKey(start, 6));
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${monthShort(e.getMonth())}`;
  return `${s.getDate()} ${monthShort(s.getMonth())} – ${e.getDate()} ${monthShort(e.getMonth())}`;
}
