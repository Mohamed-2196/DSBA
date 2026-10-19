import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarBlank } from '@phosphor-icons/react';
import { cohortLabel, useYear, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, cx, EmptyState, QueryError, Skeleton } from '../../ui';
import { isMine, usePapers } from '../papers/public';
import { useUpcomingEvents } from './api';
import { DateLeaf } from './DateLeaf';
import { dayKey, daysUntil, formatLong, parseDay, today as bahrainToday } from '../../lib/dates';
import { isHidden, occurrences, oneRowPerRepeat, repeatShort } from './mine';
import { aheadRows, lastDay } from './queries';
import type { CalendarEvent } from './types';
import { useMyCalendar } from './useMyCalendar';
import { countdownShort } from './dates';
import { dotClass, kindLabel, leafTone, splitTitle, whenAndWhere } from './eventMeta';
import './calendar-shared.css';
import './UpcomingEvents.css';

export interface UpcomingEventsProps {
  /** How many dates to list (default 5). */
  n?: number;
  /** The cohort to list (plus everyone-dates); null for every cohort. Default: the cohort the student browses. */
  year?: CohortYear | null;
  /** An event shown just above the list (Home's headline exam): left out of it. */
  skip?: string | null;
}

/**
 * Compact "coming up" list for Home and the forum sidebar: date leaf (weekday, day, month), type
 * dot, title, countdown. Follows the cohort the student browses (plus everyone-dates); signed in, it leaves out the
 * programme dates they hid and adds their own events (in their own year, or with no year picked), a repeat once, at
 * its next day. Nothing that is over is listed, and a window that has opened (applications, a VLE window) is listed
 * by its closing day ("Closes"). Each row opens the event on the calendar (/calendar?event=<id>); hosts add their own "Open calendar"
 * link. Adapts to its container's width (container queries).
 * data-hub="upcoming-events".
 */
export function UpcomingEvents({ n = 5, year: forYear, skip = null }: UpcomingEventsProps) {
  const { year: browsed } = useYear();
  const year = forYear === undefined ? browsed : forYear;
  const { getModule } = useModules();
  const [today] = useState(() => bahrainToday());
  const { year: ownYear, papers: ownPapers } = usePapers();
  const papers = year === ownYear ? ownPapers : null;
  const my = useMyCalendar();
  const prefs = my.prefs;
  const hides = !!prefs && prefs.hiddenEvents.length + prefs.hiddenModules.length + prefs.hiddenTypes.length > 0;
  // With papers, read more and keep the student's own (another paper's dates drop out); with hidden dates, as many
  // as the API gives, so a hidden type of date never empties the list.
  const ask = n + (skip ? 1 : 0);
  const query = useUpcomingEvents({ n: hides ? 60 : papers ? ask * 4 : ask, year });
  const showOwn = my.signedIn && (year == null || year === ownYear);
  const own = useMemo(() => {
    if (!showOwn || !my.events.length) return [];
    const from = dayKey(today);
    return occurrences(my.events).filter((e) => lastDay(e) >= from);
  }, [showOwn, my.events, today]);

  // signed in, it waits for what they hid and their own events, so nothing shows and then leaves
  if (query.isPending || my.loading) {
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
        <QueryError
          error={query.error}
          title="The calendar didn’t load"
          size="sm"
          panel={false}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }

  const programme = query.data.filter((e) => (!papers || isMine(e, year ?? null, papers)) && !isHidden(e, prefs));
  const rows = aheadRows<CalendarEvent>(
    oneRowPerRepeat([...programme, ...own]),
    dayKey(today),
    new Set(skip ? [skip] : []),
  ).slice(0, n);
  const ownFailed = my.loadError ? (
    <QueryError
      error={my.loadError}
      title="Your own events didn’t load"
      size="sm"
      panel={false}
      onRetry={my.retry}
      retrying={my.retrying}
      className="cal-upcoming__error"
    />
  ) : null;
  if (!rows.length) {
    return (
      <div className="cal-upcoming cal-upcoming--empty" data-hub="upcoming-events">
        {ownFailed}
        <EmptyState
          size="sm"
          icon={CalendarBlank}
          illustration="nothing-due"
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
      {ownFailed}
      <ol role="list" className="cal-upcoming__list">
        {rows.map(({ event: e, day, closes }) => {
          const date = parseDay(day);
          const days = daysUntil(date, today);
          const count = closes && days === 0 ? 'Ends today' : countdownShort(days);
          const { code, rest } = splitTitle(e);
          const module = getModule(e.moduleId);
          const name = code && module ? module.name : rest;
          return (
            <li key={e.id}>
              <Link
                to={`/calendar?event=${encodeURIComponent(e.id)}`}
                className={cx('cal-upcoming__row', e.mine ? 'cal-upcoming__row--mine' : `cal-upcoming__row--${e.type}`)}
                data-event-id={e.id}
              >
                <DateLeaf date={date} tone={leafTone(e)} className="cal-upcoming__date" />
                <span className="cal-upcoming__body">
                  <span className="cal-upcoming__title">
                    {code ? <span className="cal-upcoming__code">{code}</span> : null}
                    {code ? ' ' : null}
                    <span className="cal-upcoming__name">{name}</span>
                  </span>
                  <span className="cal-upcoming__meta">
                    <span className={cx('cal-dot', dotClass(e))} aria-hidden="true" />
                    <span>{kindLabel(e)}</span>
                    {closes ? <span className="cal-upcoming__all">Closes</span> : null}
                    {e.mine ? (
                      <>
                        {e.time ? <span className="cal-upcoming__all">{e.time}</span> : null}
                        {repeatShort(e.mine) ? <span className="cal-upcoming__all">{repeatShort(e.mine)}</span> : null}
                      </>
                    ) : e.year == null ? (
                      <span className="cal-upcoming__all">All years</span>
                    ) : null}
                    {e.sample ? <span className="cal-upcoming__all">Not confirmed</span> : null}
                    {e.type === 'exam' ? <span className="cal-upcoming__all">{whenAndWhere(e)}</span> : null}
                    <span className="visually-hidden">, {formatLong(date)}</span>
                  </span>
                </span>
                <span
                  className={cx(
                    'cal-upcoming__count',
                    days >= 0 && days <= 7 && 'is-soon',
                    e.type === 'exam' && 'is-exam',
                  )}
                >
                  {count}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
