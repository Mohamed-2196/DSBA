import { useMemo, useState } from 'react';
import { CalendarPlus, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { Button, cx, IconButton } from '../../ui';
import { dayKey, formatLongDay, parseDay, type DayKey } from '../../lib/dates';
import { addMonths, monthKey, monthTitle } from './dates';
import { DayList } from './DayList';
import { dayOrder } from './mine';
import { MonthGrid } from './MonthGrid';
import { groupByDay } from './queries';
import type { CalendarView } from './useCalendarView';

export const MONTH_TITLE_ID = 'cal-month-title';

export interface MonthPanelProps {
  view: CalendarView;
  today: Date;
  /** phones: dots for days, and the picked day's dates under the grid */
  compact: boolean;
  /** a new event of the student's own on a day */
  onAdd: (day: DayKey) => void;
}

/** A month on a grid, with its arrows and "Today". data-hub="calendar-month". */
export function MonthPanel({ view, today, compact, onAdd }: MonthPanelProps) {
  const { month, monthEvents, goMonth, goToday, isCurrentMonth, eventId, cohortYear, open } = view;
  const before = addMonths(month, -1);
  const after = addMonths(month, 1);

  return (
    <section
      className={cx('cal-month', compact && 'cal-month--compact')}
      aria-labelledby={MONTH_TITLE_ID}
      data-hub="calendar-month"
    >
      <div className="cal-month__bar">
        <h3 id={MONTH_TITLE_ID} className="cal-month__title" aria-live="polite">
          {monthTitle(month)}
        </h3>
        <Button size="sm" variant="ghost" onClick={goToday} disabled={isCurrentMonth} className="cal-month__today">
          Today
        </Button>
        <span className="cal-month__arrows">
          <IconButton
            label={`Previous month, ${monthTitle(before)}`}
            icon={CaretLeft}
            variant="secondary"
            size="sm"
            onClick={() => goMonth(before)}
          />
          <IconButton
            label={`Next month, ${monthTitle(after)}`}
            icon={CaretRight}
            variant="secondary"
            size="sm"
            onClick={() => goMonth(after)}
          />
        </span>
      </div>
      {compact ? (
        <CompactMonth view={view} today={today} onAdd={onAdd} key={monthKey(month)} />
      ) : (
        <MonthGrid
          month={month}
          events={monthEvents}
          today={today}
          selectedId={eventId}
          showCohort={!cohortYear}
          labelledBy={MONTH_TITLE_ID}
          onOpen={open}
          onNavigate={goMonth}
          onAdd={onAdd}
        />
      )}
    </section>
  );
}

/** Phones: the grid with a dot per date, and the picked day's dates under it (today, or the month's first date). */
function CompactMonth({ view, today, onAdd }: { view: CalendarView; today: Date; onAdd: (day: DayKey) => void }) {
  const { month, monthEvents, goMonth, eventId, cohortYear, open } = view;
  const byDay = useMemo(() => groupByDay(monthEvents), [monthEvents]);
  const inMonth = (key: string) => key.startsWith(monthKey(month));
  const todayKey = dayKey(today);
  const firstWithEvents = [...byDay.keys()].filter(inMonth).sort()[0] ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && inMonth(picked) ? picked : inMonth(todayKey) ? todayKey : firstWithEvents;
  const events = day ? dayOrder(byDay.get(day) ?? [], day) : [];

  return (
    <>
      <MonthGrid
        month={month}
        events={monthEvents}
        today={today}
        selectedId={eventId}
        showCohort={!cohortYear}
        labelledBy={MONTH_TITLE_ID}
        compact
        selectedDay={day}
        onSelectDay={setPicked}
        onOpen={open}
        onNavigate={goMonth}
      />
      <div className="cal-month__day" aria-live="polite">
        {day ? (
          <>
            <div className="cal-month__day-head">
              <h4 className="cal-month__day-title">{formatLongDay(parseDay(day))}</h4>
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={CalendarPlus}
                onClick={() => onAdd(day)}
                data-hub="calendar-day-add"
              >
                New event
              </Button>
            </div>
            {events.length ? (
              <DayList
                days={[{ key: day, date: parseDay(day), events }]}
                today={today}
                selectedId={eventId}
                showCohort={!cohortYear}
                onOpen={open}
                className="cal-month__day-list"
              />
            ) : (
              <p className="cal-card__empty">Nothing on this day.</p>
            )}
          </>
        ) : (
          <p className="cal-card__empty">Nothing on the calendar this month.</p>
        )}
      </div>
    </>
  );
}
