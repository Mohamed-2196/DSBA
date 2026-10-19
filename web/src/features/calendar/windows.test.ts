import { describe, expect, it } from 'vitest';
import { parseDay } from '../../lib/dates';
import type { CalendarEvent } from './types';
import { spansDays, weekBars, windowLine } from './windows';

const ev = (id: string, date: string, endDate: string | null = null) => ({ id, date, endDate }) as CalendarEvent;
// Sunday 19 to Saturday 25 October 2025
const week = Array.from({ length: 7 }, (_, i) => parseDay(`2025-10-${String(19 + i).padStart(2, '0')}`));

describe('spansDays', () => {
  it('is true only for an event that ends after it starts', () => {
    expect(spansDays(ev('a', '2025-10-20', '2025-10-22'))).toBe(true);
    expect(spansDays(ev('a', '2025-10-20', '2025-10-20'))).toBe(false);
    expect(spansDays(ev('a', '2025-10-20'))).toBe(false);
  });
});

describe('weekBars', () => {
  it('cuts a window to the week and stacks overlapping ones', () => {
    const bars = weekBars(week, [
      ev('vle', '2025-10-20', '2025-10-22'),
      ev('break', '2025-10-14', '2025-10-21'),
      ev('one', '2025-10-23'),
      ev('later', '2025-10-24', '2025-11-02'),
    ]);
    expect(bars.map(({ event, start, span, lane }) => [event.id, start, span, lane])).toEqual([
      ['vle', 1, 3, 0],
      ['break', 0, 3, 1],
      ['later', 5, 2, 0],
    ]);
  });
  it('leaves out windows outside the week', () => {
    expect(weekBars(week, [ev('x', '2025-10-01', '2025-10-05')])).toEqual([]);
  });
});

describe('windowLine', () => {
  const vle = ev('vle', '2025-10-20', '2025-10-22');
  it('says whether it is open, and when it closes', () => {
    expect(windowLine(vle, '2025-10-21')).toBe('open now, closes Wed 22 Oct');
    expect(windowLine(vle, '2025-10-19')).toBe('opens Mon 20 Oct, closes Wed 22 Oct');
    expect(windowLine(vle, '2025-10-23')).toBe('closed Wed 22 Oct');
  });
});
