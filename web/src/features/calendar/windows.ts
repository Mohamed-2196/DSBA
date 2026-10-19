// Events that run over several days (a VLE window, a break) as bars across the month grid's weeks
// (docs/design/deskmates/screens/calendar-laptop: "the window bar").
import { dayKey, formatShort, parseDay, type DayKey } from '../../lib/dates';
import { lastDay } from './queries';
import type { CalendarEvent } from './types';

/** An event that covers more than one day. */
export const spansDays = (e: Pick<CalendarEvent, 'date' | 'endDate'>): boolean => !!e.endDate && e.endDate > e.date;

export interface WeekBar {
  event: CalendarEvent;
  /** the column it starts in (0 to 6) */
  start: number;
  /** how many columns it covers */
  span: number;
  /** its line from the bottom of the week (0 is the lowest) */
  lane: number;
}

/**
 * The bars a week of the grid shows: each event that spans days and covers part of the week, cut to the week, in
 * the order given, each on the lowest line it doesn't overlap another bar on.
 */
export function weekBars(week: readonly Date[], events: readonly CalendarEvent[]): WeekBar[] {
  const keys = week.map(dayKey);
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return [];
  const lanes: number[][] = [];
  const bars: WeekBar[] = [];
  for (const event of events) {
    if (!spansDays(event)) continue;
    const end = lastDay(event);
    if (end < first || event.date > last) continue;
    const start = Math.max(0, keys.indexOf(event.date < first ? first : event.date));
    const stop = keys.indexOf(end > last ? last : end);
    const cols = Array.from({ length: stop - start + 1 }, (_, i) => start + i);
    let lane = lanes.findIndex((used) => cols.every((c) => !used.includes(c)));
    if (lane < 0) lane = lanes.push([]) - 1;
    lanes[lane]?.push(...cols);
    bars.push({ event, start, span: cols.length, lane });
  }
  return bars;
}

/**
 * What a window bar says, after the event's name: 'open now, closes Wed 22 Oct' while it runs, 'opens Mon 20 Oct,
 * closes Wed 22 Oct' before, 'closed Wed 22 Oct' after.
 */
export function windowLine(e: Pick<CalendarEvent, 'date' | 'endDate'>, today: DayKey): string {
  const end = lastDay(e);
  const closes = formatShort(parseDay(end));
  if (end < today) return `closed ${closes}`;
  if (e.date > today) return `opens ${formatShort(parseDay(e.date))}, closes ${closes}`;
  return `open now, closes ${closes}`;
}
