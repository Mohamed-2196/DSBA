import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarBlank } from '@phosphor-icons/react';
import { cohortLabel, useYear } from '../../state';
import { Button, cx, EmptyState } from '../../ui';
import { countdownShort, daysUntil, formatLong, parseKey } from './dates.js';
import { eventModule, splitTitle, typeLabel } from './eventMeta.js';
import { getUpcomingEvents } from './queries.js';
import './calendar-shared.css';
import './UpcomingEvents.css';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Compact "coming up" list for Home and the forum sidebar: date, type dot, title, countdown.
 * Each row opens the event on the calendar (?event=<id>); hosts add their own "Open calendar" link.
 * Adapts to its container's width (container queries).
 * data-hub="upcoming-events".
 */
export function UpcomingEvents({ n = 5 }) {
  const { year } = useYear();
  const [now] = useState(() => new Date());
  const events = getUpcomingEvents({ year, from: now, n });

  if (!events.length) {
    return (
      <div className="cal-upcoming cal-upcoming--empty" data-hub="upcoming-events">
        <EmptyState
          size="sm"
          icon={CalendarBlank}
          title="Nothing coming up"
          body={`Exams and deadlines${year ? ` for ${cohortLabel(year)}` : ''} show up here as soon as they're announced.`}
          action={<Button size="sm" to="/calendar">Open calendar</Button>}
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
          const module = eventModule(e);
          const name = code && module ? module.name : rest;
          return (
            <li key={e.id}>
              <Link
                to={`/calendar?event=${encodeURIComponent(e.id)}`}
                className={cx('cal-upcoming__row', `cal-upcoming__row--${e.type}`)}
                data-event-id={e.id}
              >
                <span className="cal-upcoming__date" aria-hidden="true">
                  <span className="cal-upcoming__month">{MONTHS_SHORT[date.getMonth()]}</span>
                  <span className="cal-upcoming__day">{date.getDate()}</span>
                </span>
                <span className="cal-upcoming__body">
                  <span className="cal-upcoming__title">
                    {code ? <span className="cal-upcoming__code">{code}</span> : null}
                    <span className="cal-upcoming__name">{name}</span>
                  </span>
                  <span className="cal-upcoming__meta">
                    <span className={cx('cal-dot', `cal-dot--${e.type}`)} aria-hidden="true" />
                    <span>{typeLabel(e.type)}</span>
                    {e.year == null ? <span className="cal-upcoming__all">All years</span> : null}
                    <span className="visually-hidden">, {formatLong(date)}</span>
                  </span>
                </span>
                <span className={cx('cal-upcoming__count', days <= 7 && 'is-soon', e.type === 'exam' && 'is-exam')}>
                  {countdownShort(days)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
