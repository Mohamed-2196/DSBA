import { useMemo } from 'react';
import { CalendarCheck, CalendarPlus } from '@phosphor-icons/react';
import type { CohortYear } from '../../lib/modules';
import { cohortLabel, cohortTextColor } from '../../state';
import { useModules } from '../../state/modules';
import { Button, CohortBadge, cx, EmptyState, Highlight, ModuleIcon } from '../../ui';
import { countdownLabel, daysUntil, formatLong, formatLongDay, parseKey, startOfDay } from './dates';
import { DayStrip } from './DayStrip';
import { splitTitle, timeAndPlace, typeLabel } from './eventMeta';
import { examOutlook, upcomingFrom } from './queries';
import type { CalendarEvent } from './types';
import { UpcomingBoard } from './UpcomingBoard';

export interface NextUpProps {
  /** Every event on the calendar, by date. */
  events: CalendarEvent[];
  year: CohortYear | null;
  now: Date;
  onOpen: (e: CalendarEvent) => void;
  onDownload: (e: CalendarEvent) => void;
  onShowAllYears?: () => void;
}

/**
 * The top of the calendar: what is next, whatever its type. The date with its weekday is the
 * headline, with how far away it is; then what it is. Under it the coming weeks day by day
 * (DayStrip, every type in its colour, the exam countdown measured on it) and the next dates as
 * leaves (UpcomingBoard).
 * data-hub="next-exam".
 */
export function NextUp({ events, year, now, onOpen, onDownload, onShowAllYears }: NextUpProps) {
  const { getModule } = useModules();
  const upcoming = useMemo(() => upcomingFrom(events, { year, from: now, n: Infinity }), [events, year, now]);
  const outlook = useMemo(() => examOutlook(events, { year, from: now }), [events, year, now]);
  const who = year ? cohortLabel(year) : null;
  const next = upcoming[0];

  if (!next) {
    return (
      <section className="cal-next cal-next--empty" data-hub="next-exam" aria-label="Next up">
        <EmptyState
          size="sm"
          icon={CalendarCheck}
          title={who ? `Nothing coming up for ${who}` : 'Nothing coming up'}
          body="New dates show up here, with the day of the week and a countdown, as soon as they're announced."
          action={
            year && onShowAllYears ? (
              <Button size="sm" onClick={onShowAllYears}>
                See every year’s calendar
              </Button>
            ) : null
          }
        />
      </section>
    );
  }

  const today = startOfDay(now);
  const date = parseKey(next.date);
  const days = daysUntil(date, today);
  const module = getModule(next.moduleId);
  const name = next.type === 'exam' && module ? module.name : splitTitle(next).rest;
  const detail = [timeAndPlace(next), next.year == null ? 'All years' : null, next.sample ? 'Not confirmed' : null].filter(Boolean).join(', ');
  const sameDay = upcoming.filter((e) => e.date === next.date).length - 1;

  return (
    <section className="cal-next" data-hub="next-exam" aria-labelledby="cal-next-title">
      <div className="cal-next__top">
        <p className="cal-next__kicker">
          <span>Next up</span>
          {year ? <CohortBadge year={year} size="sm" /> : null}
          {sameDay > 0 ? <span className="cal-next__of">and {sameDay} more that day</span> : null}
        </p>
        <div className="cal-next__actions">
          <Button variant="primary" leadingIcon={CalendarPlus} onClick={() => onDownload(next)}>
            Add to calendar
          </Button>
          {module ? (
            <Button to={`/modules/${module.id}`} leadingIcon={<ModuleIcon moduleId={module.id} />}>
              Open module
            </Button>
          ) : (
            <Button onClick={() => onOpen(next)}>Details</Button>
          )}
        </div>
      </div>

      <p className="cal-next__date">
        <time dateTime={next.date}>
          <span aria-hidden="true">
            {formatLongDay(date)}
            {date.getFullYear() !== today.getFullYear() ? ` ${date.getFullYear()}` : ''}
          </span>
          <span className="visually-hidden">{formatLong(date)}</span>
        </time>
        <span className="cal-next__when">
          <span className="visually-hidden">, </span>
          <Highlight as="span">{countdownLabel(days)}</Highlight>
        </span>
      </p>
      <h2 id="cal-next-title" className="cal-next__what">
        <span className={cx('cal-type', `cal-tone--${next.type}`)}>{typeLabel(next.type)}</span>
        {next.unitCode ? (
          <span className="cal-next__code u-code" style={{ color: cohortTextColor(next.year) }}>
            {next.unitCode}
          </span>
        ) : null}
        <span>{name}</span>
        {detail ? <span className="cal-next__detail">{detail}</span> : null}
      </h2>

      <DayStrip
        events={upcoming}
        outlook={outlook}
        now={now}
        nextId={next.id}
        getModule={getModule}
        noExams={who ? `No exams ahead on the ${who} calendar` : 'No exams ahead on the calendar'}
      />
      <UpcomingBoard events={upcoming} today={today} onOpen={onOpen} onDownload={onDownload} getModule={getModule} />
    </section>
  );
}
