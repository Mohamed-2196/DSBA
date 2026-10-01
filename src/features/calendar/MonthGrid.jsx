import { useEffect, useMemo, useRef, useState } from 'react';
import { cohortTextColor } from '../../state';
import { cx } from '../../ui';
import { addDays, formatLong, isWeekend, monthMatrix, monthOfDate, toKey, WEEKDAYS } from './dates.js';
import { chipText, eventSummary } from './eventMeta.js';

const MAX_CHIPS = 2;

function groupByDay(events) {
  const map = new Map();
  events.forEach((e) => {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  });
  return map;
}

/**
 * Month grid (ARIA grid, Sunday first, Fri/Sat weekend). One tab stop: arrow keys move by day/week,
 * Home/End to the week's ends, PageUp/PageDown change month, Enter opens the day's first event.
 * data-pulse="calendar-grid" on the grid, "calendar-event" on each event.
 */
export function MonthGrid({ month, events, today, selectedId, showCohort, labelledBy, onOpen, onNavigate }) {
  const { y, m } = month;
  const weeks = useMemo(() => monthMatrix({ y, m }), [y, m]);
  const byDay = useMemo(() => groupByDay(events), [events]);
  const todayKey = toKey(today);
  const gridRef = useRef(null);
  const wantFocus = useRef(false);
  const [focusKey, setFocusKey] = useState(null);

  const inMonth = (d) => d.getMonth() === m && d.getFullYear() === y;
  const visibleKeys = weeks.flat().filter(inMonth).map(toKey);
  const firstEventKey = visibleKeys.find((k) => byDay.has(k));
  const activeKey = focusKey && visibleKeys.includes(focusKey)
    ? focusKey
    : visibleKeys.includes(todayKey)
      ? todayKey
      : firstEventKey || visibleKeys[0];

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    gridRef.current?.querySelector(`[data-date="${activeKey}"]`)?.focus();
  });

  const moveTo = (date) => {
    setFocusKey(toKey(date));
    wantFocus.current = true;
    if (!inMonth(date)) onNavigate(monthOfDate(date));
  };

  const onKeyDown = (e, date) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
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
      const list = byDay.get(toKey(date));
      if (list?.length) {
        e.preventDefault();
        onOpen(list[0]);
      }
    }
  };

  return (
    <div ref={gridRef} role="grid" aria-labelledby={labelledBy} className="cal-grid" data-pulse="calendar-grid">
      <div role="row" className="cal-grid__row cal-grid__row--head">
        {WEEKDAYS.map((w, i) => (
          <div key={w.short} role="columnheader" className={cx('cal-grid__wd', (i === 5 || i === 6) && 'is-weekend')}>
            <abbr title={w.long}>{w.short}</abbr>
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={toKey(week[0])} role="row" className="cal-grid__row">
          {week.map((date) => {
            const key = toKey(date);
            const list = byDay.get(key) || [];
            const outside = !inMonth(date);
            const isToday = key === todayKey;
            const past = date < today;
            const label = `${formatLong(date)}${isToday ? ', today' : ''}${list.length ? `, ${list.length} event${list.length > 1 ? 's' : ''}: ${list.map(eventSummary).join('; ')}` : ''}`;
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
                      const { code, line } = chipText(ev);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          tabIndex={-1}
                          className={cx('cal-chip', `cal-chip--${ev.type}`, ev.id === selectedId && 'is-selected', past && 'is-past')}
                          onClick={() => onOpen(ev)}
                          data-pulse="calendar-event"
                          data-event-id={ev.id}
                          aria-label={eventSummary(ev)}
                        >
                          <span className="cal-chip__top">
                            <span className={cx('cal-dot', `cal-dot--${ev.type}`)} aria-hidden="true" />
                            <span className={cx('cal-chip__title', code && 'u-code')}>{code || line}</span>
                            {showCohort && ev.year ? (
                              <span className="cal-chip__cohort" style={{ color: cohortTextColor(ev.year) }}>Y{ev.year}</span>
                            ) : null}
                          </span>
                          {code ? <span className="cal-chip__line">{line}</span> : null}
                        </button>
                      );
                    })}
                    {list.length > MAX_CHIPS ? (
                      <button type="button" tabIndex={-1} className="cal-day__more" onClick={() => onOpen(list[MAX_CHIPS])}>
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
