import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { cohortTextColor } from '../../state';
import { useModules } from '../../state/modules';
import { cx } from '../../ui';
import { addDays, dayKey, formatLong, isWeekend, WEEKDAYS, type DayKey } from '../../lib/dates';
import { monthMatrix, monthOfDate, type MonthRef } from './dates';
import { DayMenu } from './DayMenu';
import { chipClass, chipText, dotClass, eventSummary } from './eventMeta';
import { dayOrder } from './mine';
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
  /** phones: each day is its number and a dot per date (up to three); a tap on a day picks it */
  compact?: boolean;
  /** compact: the day picked, and picking one */
  selectedDay?: string | null;
  onSelectDay?: (key: string) => void;
  onOpen: (e: CalendarEvent) => void;
  onNavigate: (month: MonthRef) => void;
  /** a new event of the student's own on a day (offered where a day opens) */
  onAdd?: (day: DayKey) => void;
}

/** Opens the day of the grid cell `el` is in: a click on its number. */
const openDay = (el: Element | null) =>
  el?.closest('[role="gridcell"]')?.querySelector<HTMLButtonElement>('.cal-day__num')?.click();

/**
 * Month grid (ARIA grid, Sunday first, Fri/Sat weekend). One tab stop: arrow keys move by day/week,
 * Home/End to the week's ends, PageUp/PageDown change month, Enter opens the day: every date on it and a new event
 * of the student's own (in `compact`, picks the day). A day shows its first dates (what starts that day, exams first,
 * then the student's own) and "N more", which opens the day too; its number opens it as well. A multi-day event (a
 * break) sits on each of its days. On phones (`compact`) a day shows dots instead and a tap on it picks it; the page
 * lists the picked day's dates under the grid.
 * data-hub="calendar-grid" on the grid, "calendar-event" on each event.
 */
export function MonthGrid({
  month,
  events,
  today,
  selectedId,
  showCohort,
  labelledBy,
  compact = false,
  selectedDay = null,
  onSelectDay,
  onOpen,
  onNavigate,
  onAdd,
}: MonthGridProps) {
  const { y, m } = month;
  const { getModule } = useModules();
  const weeks = useMemo(() => monthMatrix({ y, m }), [y, m]);
  const byDay = useMemo(() => {
    const days = groupByDay(events);
    for (const [key, list] of days) days.set(key, dayOrder(list, key));
    return days;
  }, [events]);
  const todayKey = dayKey(today);
  const gridRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const inMonth = (d: Date) => d.getMonth() === m && d.getFullYear() === y;
  const visibleKeys = weeks
    .flat()
    .filter(inMonth)
    .map((d) => dayKey(d));
  const firstEventKey = visibleKeys.find((k) => byDay.has(k));
  const activeKey =
    focusKey && visibleKeys.includes(focusKey)
      ? focusKey
      : selectedDay && visibleKeys.includes(selectedDay)
        ? selectedDay
        : visibleKeys.includes(todayKey)
          ? todayKey
          : (firstEventKey ?? visibleKeys[0]);

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${activeKey}"]`)?.focus();
  });

  const moveTo = (date: Date) => {
    setFocusKey(dayKey(date));
    wantFocus.current = true;
    if (!inMonth(date)) onNavigate(monthOfDate(date));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, date: Date) => {
    // keys pressed in an opened day reach the cell through React's tree (the day is in a portal): they are the day's
    if (!(e.target instanceof Node) || !e.currentTarget.contains(e.target)) return;
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
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
      e.preventDefault();
      if (compact) onSelectDay?.(dayKey(date));
      else openDay(e.currentTarget);
    }
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-labelledby={labelledBy}
      className={cx('cal-grid', compact && 'cal-grid--compact')}
      data-hub="calendar-grid"
      style={{ '--rows': weeks.length } as CSSProperties}
    >
      <div role="row" className="cal-grid__row cal-grid__row--head">
        {WEEKDAYS.map((w, i) => (
          <div key={w.short} role="columnheader" className={cx('cal-grid__wd', (i === 5 || i === 6) && 'is-weekend')}>
            <abbr title={w.long}>{w.short}</abbr>
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={dayKey(week[0] ?? today)} role="row" className="cal-grid__row">
          {week.map((date) => {
            const key = dayKey(date);
            const list = byDay.get(key) ?? [];
            const outside = !inMonth(date);
            const isToday = key === todayKey;
            const past = date < today;
            const label = `${formatLong(date)}${isToday ? ', today' : ''}${list.length ? `, ${list.length} event${list.length > 1 ? 's' : ''}: ${list.map(eventSummary).join('; ')}` : ''}`;
            const more = list.length - MAX_CHIPS;
            const picked = compact && key === selectedDay;
            return (
              <div
                key={key}
                role="gridcell"
                data-date={key}
                tabIndex={key === activeKey ? 0 : -1}
                aria-label={label}
                aria-current={isToday ? 'date' : undefined}
                aria-selected={compact ? picked : undefined}
                className={cx(
                  'cal-day',
                  outside && 'is-outside',
                  isToday && 'is-today',
                  isWeekend(date) && 'is-weekend',
                  past && 'is-past',
                  list.length > 0 && 'has-events',
                  picked && 'is-selected',
                )}
                onKeyDown={(e) => onKeyDown(e, date)}
                onClick={compact && onSelectDay ? () => onSelectDay(key) : undefined}
                onFocus={(e) => {
                  if (e.target === e.currentTarget) setFocusKey(key);
                }}
              >
                <span className="cal-day__head">
                  {compact ? (
                    <span className="cal-day__num" aria-hidden="true">
                      {date.getDate()}
                    </span>
                  ) : (
                    <DayMenu
                      day={key}
                      events={list}
                      showCohort={showCohort}
                      onOpen={onOpen}
                      onAdd={onAdd}
                      className="cal-day__num"
                    >
                      {date.getDate()}
                    </DayMenu>
                  )}
                  {isToday && !compact ? (
                    <span className="cal-day__today" aria-hidden="true">
                      Today
                    </span>
                  ) : null}
                </span>
                {compact ? (
                  list.length ? (
                    <span className="cal-day__dots" aria-hidden="true">
                      {list.slice(0, 3).map((ev) => (
                        <span key={ev.id} className={cx('cal-dot', dotClass(ev))} />
                      ))}
                    </span>
                  ) : null
                ) : list.length ? (
                  <span className="cal-day__events">
                    {list.slice(0, MAX_CHIPS).map((ev) => {
                      const { code, line } = chipText(ev, getModule(ev.moduleId));
                      const time = ev.mine?.startTime?.slice(0, 5) ?? null;
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          tabIndex={-1}
                          className={cx(
                            'cal-chip',
                            chipClass(ev),
                            ev.id === selectedId && 'is-selected',
                            past && 'is-past',
                          )}
                          onClick={() => onOpen(ev)}
                          data-hub="calendar-event"
                          data-event-id={ev.id}
                          aria-label={eventSummary(ev)}
                        >
                          <span className="cal-chip__top">
                            <span className={cx('cal-dot', dotClass(ev))} aria-hidden="true" />
                            <span className={cx('cal-chip__title', code && 'u-code')}>{code || line}</span>
                            {showCohort && ev.year ? (
                              <span className="cal-chip__cohort" style={{ color: cohortTextColor(ev.year) }}>
                                Y{ev.year}
                              </span>
                            ) : null}
                          </span>
                          {code ? (
                            <span className="cal-chip__line">{line}</span>
                          ) : time ? (
                            <span className="cal-chip__line">{time}</span>
                          ) : null}
                        </button>
                      );
                    })}
                    {more > 0 ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        className="cal-day__more"
                        onClick={(e) => openDay(e.currentTarget)}
                      >
                        {more} more
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
