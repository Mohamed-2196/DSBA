import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarBlank } from '@phosphor-icons/react';
import { cohortLabel, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, cx, EmptyState, Skeleton } from '../../ui';
import { useUpcomingEvents } from './api';
import { DateLeaf } from './DateLeaf';
import { countdownShort, daysUntil, formatLong, parseKey } from './dates';
import { splitTitle, typeLabel } from './eventMeta';
import './calendar-shared.css';
import './UpcomingEvents.css';

export interface UpcomingEventsProps {
  /** How many dates to list (default 5). */
  n?: number;
}

/**
 * Compact "coming up" list for Home and the forum sidebar: date leaf (weekday, day, month), type
 * dot, title, countdown. Follows the cohort the student browses (plus everyone-dates).
 * Each row opens the event on the calendar (/calendar?event=<id>); hosts add their own "Open calendar" link.
 * Adapts to its container's width (container queries).
 * data-hub="upcoming-events".
 */
export function UpcomingEvents({ n = 5 }: UpcomingEventsProps) {
  const { year } = useYear();
  const { getModule } = useModules();
  const [now] = useState(() => new Date());
  const query = useUpcomingEvents({ n, year });

  if (query.isPending) {
    return (
      <div className="cal-upcoming" data-hub="upcoming-events" aria-busy="true">
        <span className="visually-hidden">Loading the calendar</span>
        <ol role="list" className="cal-upcoming__list" aria-hidden="true">
          {Array.from({ length: Math.min(n, 3) }, (_, i) => (
            <li key={i} className="cal-upcoming__row cal-upcoming__row--loading">
              <Skeleton width={48} height={56} radius={10} />
              <span className="cal-upcoming__body">
                <Skeleton width="70%" height={14} />
                <Skeleton width="40%" height={12} />
              </span>
              <Skeleton width={44} height={14} />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="cal-upcoming cal-upcoming--empty" data-hub="upcoming-events">
        <EmptyState
          size="sm"
          icon={CalendarBlank}
          title="The calendar didn’t load"
          body="Check your connection, then try again."
          action={
            <Button size="sm" onClick={() => void query.refetch()} loading={query.isFetching}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const events = query.data;
  if (!events.length) {
    return (
      <div className="cal-upcoming cal-upcoming--empty" data-hub="upcoming-events">
        <EmptyState
          size="sm"
          icon={CalendarBlank}
          title="Nothing coming up"
          body={`Exams, deadlines and events${year ? ` for ${cohortLabel(year)}` : ''} show up here as soon as they're announced.`}
          action={
            <Button size="sm" to="/calendar">
              Open calendar
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="cal-upcoming" data-hub="upcoming-events">
      <ol role="list" className="cal-upcoming__list">
        {events.map((e) => {
          const date = parseKey(e.date);
          const days = daysUntil(date, now);
          const { code, rest } = splitTitle(e);
          const module = getModule(e.moduleId);
          const name = code && module ? module.name : rest;
          return (
            <li key={e.id}>
              <Link to={`/calendar?event=${encodeURIComponent(e.id)}`} className={cx('cal-upcoming__row', `cal-upcoming__row--${e.type}`)} data-event-id={e.id}>
                <DateLeaf date={date} tone={e.type} className="cal-upcoming__date" />
                <span className="cal-upcoming__body">
                  <span className="cal-upcoming__title">
                    {code ? <span className="cal-upcoming__code">{code}</span> : null}
                    <span className="cal-upcoming__name">{name}</span>
                  </span>
                  <span className="cal-upcoming__meta">
                    <span className={cx('cal-dot', `cal-dot--${e.type}`)} aria-hidden="true" />
                    <span>{typeLabel(e.type)}</span>
                    {e.year == null ? <span className="cal-upcoming__all">All years</span> : null}
                    {e.sample ? <span className="cal-upcoming__all">Not confirmed</span> : null}
                    <span className="visually-hidden">, {formatLong(date)}</span>
                  </span>
                </span>
                <span className={cx('cal-upcoming__count', days <= 7 && 'is-soon', e.type === 'exam' && 'is-exam')}>{countdownShort(days)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
