import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { cohortTextColor } from '../../state';
import { useModules } from '../../state/modules';
import { cx } from '../../ui';
import { addDays, formatLong, isWeekend, monthMatrix, monthOfDate, toKey, WEEKDAYS, type MonthRef } from './dates';
import { chipText, eventSummary } from './eventMeta';
import { groupByDay } from './queries';
import type { CalendarEvent } from './types';

const MAX_CHIPS = 2;

export interface MonthGridProps {
  month: MonthRef;
  events: CalendarEvent[];
  today: Date;
  selectedId: string | null;
  showCohort: boolean;
  labelledBy: string;
  onOpen: (e: CalendarEvent) => void;
  onNavigate: (month: MonthRef) => void;
}

/**
 * Month grid (ARIA grid, Sunday first, Fri/Sat weekend). One tab stop: arrow keys move by day/week,
 * Home/End to the week's ends, PageUp/PageDown change month, Enter opens the day's first event.
 * A multi-day event (a break) sits on each of its days.
 * data-hub="calendar-grid" on the grid, "calendar-event" on each event.
 */
export function MonthGrid({ month, events, today, selectedId, showCohort, labelledBy, onOpen, onNavigate }: MonthGridProps) {
  const { y, m } = month;
  const { getModule } = useModules();
  const weeks = useMemo(() => monthMatrix({ y, m }), [y, m]);
  const byDay = useMemo(() => groupByDay(events), [events]);
  const todayKey = toKey(today);
  const gridRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const inMonth = (d: Date) => d.getMonth() === m && d.getFullYear() === y;
  const visibleKeys = weeks.flat().filter(inMonth).map(toKey);
  const firstEventKey = visibleKeys.find((k) => byDay.has(k));
  const activeKey =
    focusKey && visibleKeys.includes(focusKey) ? focusKey : visibleKeys.includes(todayKey) ? todayKey : (firstEventKey ?? visibleKeys[0]);

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${activeKey}"]`)?.focus();
  });

  const moveTo = (date: Date) => {
    setFocusKey(toKey(date));
    wantFocus.current = true;
    if (!inMonth(date)) onNavigate(monthOfDate(date));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, date: Date) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const step = steps[e.key];
    if (step) {
      e.preventDefault();
      moveTo(addDays(date, step));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      moveTo(addDays(date, e.key === 'Home' ? -date.getDay() : 6 - date.getDay()));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const dir = e.key === 'PageUp' ? -1 : 1;
      const lastDay = new Date(date.getFullYear(), date.getMonth() + dir + 1, 0).getDate();
      moveTo(new Date(date.getFullYear(), date.getMonth() + dir, Math.min(date.getDate(), lastDay)));
    } else if (e.key === 'Enter' || e.key === ' ') {
      const first = byDay.get(toKey(date))?.[0];
      if (first) {
        e.preventDefault();
        onOpen(first);
      }
    }
  };

  return (
    <div ref={gridRef} role="grid" aria-labelledby={labelledBy} className="cal-grid" data-hub="calendar-grid" style={{ '--rows': weeks.length } as CSSProperties}>
      <div role="row" className="cal-grid__row cal-grid__row--head">
        {WEEKDAYS.map((w, i) => (
          <div key={w.short} role="columnheader" className={cx('cal-grid__wd', (i === 5 || i === 6) && 'is-weekend')}>
            <abbr title={w.long}>{w.short}</abbr>
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={toKey(week[0] ?? today)} role="row" className="cal-grid__row">
          {week.map((date) => {
            const key = toKey(date);
            const list = byDay.get(key) ?? [];
            const outside = !inMonth(date);
            const isToday = key === todayKey;
            const past = date < today;
            const label = `${formatLong(date)}${isToday ? ', today' : ''}${list.length ? `, ${list.length} event${list.length > 1 ? 's' : ''}: ${list.map(eventSummary).join('; ')}` : ''}`;
            const more = list[MAX_CHIPS];
            return (
              <div
                key={key}
                role="gridcell"
                data-date={key}
                tabIndex={key === activeKey ? 0 : -1}
                aria-label={label}
                aria-current={isToday ? 'date' : undefined}
                className={cx('cal-day', outside && 'is-outside', isToday && 'is-today', isWeekend(date) && 'is-weekend', past && 'is-past', list.length > 0 && 'has-events')}
                onKeyDown={(e) => onKeyDown(e, date)}
                onFocus={(e) => {
                  if (e.target === e.currentTarget) setFocusKey(key);
                }}
              >
                <span className="cal-day__head" aria-hidden="true">
                  <span className="cal-day__num">{date.getDate()}</span>
                  {isToday ? <span className="cal-day__today">Today</span> : null}
                </span>
                {list.length ? (
                  <span className="cal-day__events">
                    {list.slice(0, MAX_CHIPS).map((ev) => {
                      const { code, line } = chipText(ev, getModule(ev.moduleId));
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          tabIndex={-1}
                          className={cx('cal-chip', `cal-chip--${ev.type}`, ev.id === selectedId && 'is-selected', past && 'is-past')}
                          onClick={() => onOpen(ev)}
                          data-hub="calendar-event"
                          data-event-id={ev.id}
                          aria-label={eventSummary(ev)}
                        >
                          <span className="cal-chip__top">
                            <span className={cx('cal-dot', `cal-dot--${ev.type}`)} aria-hidden="true" />
                            <span className={cx('cal-chip__title', code && 'u-code')}>{code || line}</span>
                            {showCohort && ev.year ? (
                              <span className="cal-chip__cohort" style={{ color: cohortTextColor(ev.year) }}>
                                Y{ev.year}
                              </span>
                            ) : null}
                          </span>
                          {code ? <span className="cal-chip__line">{line}</span> : null}
                        </button>
                      );
                    })}
                    {more ? (
                      <button type="button" tabIndex={-1} className="cal-day__more" onClick={() => onOpen(more)}>
                        {list.length - MAX_CHIPS} more
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
