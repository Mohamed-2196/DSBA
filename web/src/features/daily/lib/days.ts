// The Daily's days: labels, the month grid of past days, and the order of play.
import { addDaysToKey, daysBetween, formatDay, isDayKey, parseDay, type DayKey } from '../../../lib/dates';
import type { GameDay, GameId } from '../types';

/** 'Saturday 17 October' (the year only when it isn't this year's). */
export function dayLabel(day: DayKey, today: DayKey): string {
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return formatDay(day, { weekday: 'long', year: !sameYear });
}

/** The set's number on a day: 1 on the first day. */
export const setNumber = (day: DayKey, firstDay: DayKey): number => daysBetween(firstDay, day) + 1;

/** 'YYYY-MM' of a day key. */
export const monthOf = (day: DayKey): string => day.slice(0, 7);

/** The month before or after a 'YYYY-MM' month. */
export function shiftMonth(month: string, by: number): string {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * The month as calendar weeks from Sunday: each cell a day key of that month, or null for the days of the weeks
 * that fall in the months either side.
 */
export function monthWeeks(month: string): (DayKey | null)[][] {
  const first = `${month}-01`;
  if (!isDayKey(first)) return [];
  const lead = parseDay(first).getDay(); // 0 is Sunday
  const days: (DayKey | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d.startsWith(month); d = addDaysToKey(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);
  return Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
}

/** The next game to play after `current` (in the hub's order, wrapping round), or null when every game is done. */
export function nextToPlay(games: readonly GameDay[], current: GameId): GameDay | null {
  const at = games.findIndex((g) => g.info.id === current);
  const rest = [...games.slice(at + 1), ...games.slice(0, Math.max(at, 0))];
  return rest.find((g) => g.status !== 'won' && g.status !== 'lost') ?? null;
}
