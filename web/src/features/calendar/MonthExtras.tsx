// What the agenda shows around a month: a month with nothing in it, and "Continues in …" under the last date.
import type { ReactNode } from 'react';
import { CalendarBlank, CaretRight, Plus } from '@phosphor-icons/react';
import { cohortLabel } from '../../state';
import { Button, EmptyState } from '../../ui';
import { formatLongDay, parseDay } from '../../lib/dates';
import { monthLabel, monthTitle, sameMonth } from './dates';
import { monthOfEvent, type CalendarView } from './useCalendarView';

interface EmptyMonthProps {
  view: CalendarView;
  /** nothing at all on the calendar */
  calendarEmpty: boolean;
  /** moderators can add the first date */
  onAdd?: () => void;
}

export function EmptyMonth({ view, calendarEmpty, onAdd }: EmptyMonthProps) {
  const { month, nextWithEvents: next, types, cohortYear, goMonth, clearTypes, setAllYears } = view;
  let body: string;
  let action: ReactNode = null;
  if (next) {
    body = `Next up: ${next.title}, ${formatLongDay(parseDay(next.date))}.`;
    action = (
      <Button size="sm" onClick={() => goMonth(monthOfEvent(next))}>
        Go to {monthTitle(monthOfEvent(next))}
      </Button>
    );
  } else if (types.size) {
    body = 'No events of the selected types. Show every type to see more.';
    action = (
      <Button size="sm" onClick={clearTypes}>
        Show every type
      </Button>
    );
  } else if (calendarEmpty) {
    body = onAdd ? 'The calendar is empty. Add the first date for everyone.' : 'Dates show up here as soon as they’re announced.';
    action = onAdd ? (
      <Button size="sm" variant="primary" leadingIcon={Plus} onClick={onAdd}>
        Add event
      </Button>
    ) : null;
  } else if (cohortYear) {
    body = `Nothing else is scheduled for ${cohortLabel(cohortYear)}.`;
    action = (
      <Button size="sm" onClick={() => setAllYears(true)}>
        Show all years
      </Button>
    );
  } else {
    body = 'Nothing else is scheduled.';
  }
  return (
    <div className="cal-empty">
      <EmptyState size="sm" icon={CalendarBlank} title={`Nothing on the calendar in ${monthLabel(month)}`} body={body} action={action} />
    </div>
  );
}

/** "Continues in November: 4 events", under a month whose dates go on in a later month. */
export function ContinuesIn({ view }: { view: CalendarView }) {
  const { month, monthEvents, nextWithEvents: next, visible, goMonth } = view;
  if (!monthEvents.length || !next || sameMonth(monthOfEvent(next), month)) return null;
  const nextMonth = monthOfEvent(next);
  const count = visible.filter((e) => sameMonth(monthOfEvent(e), nextMonth)).length;
  return (
    <button type="button" className="cal-agenda__next" onClick={() => goMonth(nextMonth)}>
      <span>Continues in {monthLabel(nextMonth)}</span>
      <span className="cal-agenda__next-sub">
        {count} {count === 1 ? 'event' : 'events'}
      </span>
      <CaretRight aria-hidden="true" weight="bold" />
    </button>
  );
}
