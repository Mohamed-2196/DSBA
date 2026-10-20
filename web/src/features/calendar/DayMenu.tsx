import type { ReactNode } from 'react';
import { cohortTextColor } from '../../state';
import { Button, cx, Menu, Icon, glyph } from '../../ui';
import { formatLong, formatLongDay, parseDay, type DayKey } from '../../lib/dates';
import { dotClass, kindLabel } from './eventMeta';
import type { CalendarEvent } from './types';

export interface DayMenuProps {
  day: DayKey;
  /** the day's events, in the order the grid shows them */
  events: readonly CalendarEvent[];
  /** say which year each date is for (the grid shows every year) */
  showCohort: boolean;
  onOpen: (e: CalendarEvent) => void;
  /** a new event of the student's own on this day */
  onAdd?: (day: DayKey) => void;
  /** the trigger: the day's number on the grid */
  children: ReactNode;
  className?: string;
}

/**
 * A day of the month grid, opened from its number, its "more" button or Enter: every date on it, each opening its
 * details, and a new event of the student's own on that day. data-hub="calendar-day".
 */
export function DayMenu({ day, events, showCohort, onOpen, onAdd, children, className }: DayMenuProps) {
  const date = parseDay(day);
  return (
    <Menu
      label={formatLongDay(date)}
      width={300}
      trigger={
        <button type="button" tabIndex={-1} className={className} aria-label={formatLong(date)}>
          {children}
        </button>
      }
    >
      {({ close }) => (
        <div className="cal-daymenu" data-hub="calendar-day">
          <p className="cal-daymenu__title">{formatLongDay(date)}</p>
          {events.length ? (
            <ul role="list" className="cal-daymenu__list">
              {events.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    data-roving
                    className="cal-daymenu__row"
                    onClick={() => {
                      close(false);
                      onOpen(e);
                    }}
                  >
                    <span className={cx('cal-dot', dotClass(e))} aria-hidden="true" />
                    <span className="cal-daymenu__name">{e.title}</span>
                    <span className="cal-daymenu__meta">
                      {e.mine ? (e.time ?? kindLabel(e)) : kindLabel(e)}
                      {showCohort && e.year ? (
                        <span className="cal-daymenu__cohort" style={{ color: cohortTextColor(e.year) }}>
                          {' '}
                          Y{e.year}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cal-daymenu__empty">Nothing on this day.</p>
          )}
          {onAdd ? (
            <div className="cal-daymenu__foot">
              <Button
                size="sm"
                leadingIcon={<Icon glyph={glyph.calendarAdd} />}
                data-roving
                onClick={() => {
                  close(false);
                  onAdd(day);
                }}
              >
                New event on this day
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Menu>
  );
}
