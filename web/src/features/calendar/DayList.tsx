import { CohortBadge, cx } from '../../ui';
import { daysUntil, formatLong, formatShort, parseDay } from '../../lib/dates';
import { DateLeaf } from './DateLeaf';
import { countdownLabel } from './dates';
import { splitTitle, typeLabel, whenAndWhere } from './eventMeta';
import type { DayGroup } from './queries';
import type { CalendarEvent } from './types';

export interface DayListProps {
  days: DayGroup[];
  today: Date;
  selectedId: string | null;
  /** say which year each date is for (the list shows every year) */
  showCohort: boolean;
  onOpen: (e: CalendarEvent) => void;
  className?: string;
}

/**
 * Days with what is on them: the date as a leaf, then one row per event (its type, whether it is confirmed, what
 * it is, and its time and place; an exam always says whether its time is set). Each row opens the event.
 * data-hub="calendar-event" on each row.
 */
export function DayList({ days, today, selectedId, showCohort, onOpen, className }: DayListProps) {
  return (
    <ol role="list" className={cx('cal-days', className)}>
      {days.map((day) => {
        const n = daysUntil(day.date, today);
        const first = day.events[0];
        const tone = first && day.events.every((e) => e.type === first.type) ? first.type : 'neutral';
        return (
          <li key={day.key} className={cx('cal-days__day', n === 0 && 'is-today')}>
            <DateLeaf date={day.date} tone={n === 0 ? 'today' : tone} solid={n === 0} className="cal-days__leaf" />
            <ul role="list" className="cal-days__events">
              {day.events.map((e) => (
                <li key={e.id}>
                  <EventRow event={e} day={day.date} days={n} selected={e.id === selectedId} showCohort={showCohort} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

interface EventRowProps {
  event: CalendarEvent;
  day: Date;
  /** days from today to `day` */
  days: number;
  selected: boolean;
  showCohort: boolean;
  onOpen: (e: CalendarEvent) => void;
}

function EventRow({ event: e, day, days, selected, showCohort, onOpen }: EventRowProps) {
  const { code, rest } = splitTitle(e);
  const where = whenAndWhere(e);
  const until = e.endDate && e.endDate > e.date ? `Until ${formatShort(parseDay(e.endDate))}` : null;
  const detail = [until, where].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      className={cx('cal-row', `cal-tone--${e.type}`, e.sample && 'is-unconfirmed', selected && 'is-selected')}
      onClick={() => onOpen(e)}
      data-hub="calendar-event"
      data-event-id={e.id}
    >
      <span className="visually-hidden">{formatLong(day)}: </span>
      <span className="cal-row__meta">
        <span className="cal-row__type">
          <span className={cx('cal-dot', `cal-dot--${e.type}`)} aria-hidden="true" />
          {typeLabel(e.type)}
        </span>
        {showCohort ? <CohortBadge year={e.year} variant="dot" size="sm" short /> : e.year == null ? <span className="cal-row__all">All years</span> : null}
        {e.sample ? <span className="cal-unconfirmed">Not confirmed yet</span> : null}
      </span>
      <span className="cal-row__when">{countdownLabel(days)}</span>
      <span className="cal-row__name">
        {code ? <span className="u-code">{code} </span> : null}
        {rest}
      </span>
      {detail ? <span className={cx('cal-row__where', e.type === 'exam' && !e.time && 'is-unset')}>{detail}</span> : null}
    </button>
  );
}
