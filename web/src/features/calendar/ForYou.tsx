import { useMemo } from 'react';
import { cohortLabel, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, CohortBadge, cx, EmptyState, Icon, glyph } from '../../ui';
import { daysUntil, formatLong, formatLongDay, formatShort, parseDay } from '../../lib/dates';
import { AddToCalendar } from './AddToCalendar';
import { countdownLabel } from './dates';
import { DayList } from './DayList';
import { splitTitle, whenAndWhere } from './eventMeta';
import { groupByMonth, weekEnd, type NextExam } from './queries';
import type { CalendarEvent } from './types';

export interface ForYouProps {
  year: CohortYear | null;
  nextExam: NextExam | null;
  week: CalendarEvent[];
  today: Date;
  todayKey: string;
  selectedId: string | null;
  onOpen: (e: CalendarEvent) => void;
}

/**
 * The answer at the top of the calendar, for the student's year (every year without one): their next exam, and
 * what is on in the week ahead. Confirmed dates come first; unconfirmed ones are marked.
 * data-hub="calendar-for-you".
 */
export function ForYou({ year, nextExam, week, today, todayKey, selectedId, onOpen }: ForYouProps) {
  const exam = nextExam?.exam ?? null;
  // The next exam has its own card: the week lists everything else.
  const rest = useMemo(() => week.filter((e) => e.id !== exam?.id), [week, exam]);
  const days = useMemo(() => groupByMonth(rest, todayKey).flatMap((m) => m.days), [rest, todayKey]);
  const who = year ? cohortLabel(year) : 'every year';
  const end = parseDay(weekEnd(todayKey));

  return (
    <section className="cal-foryou" aria-label={`For ${who}`} data-hub="calendar-for-you">
      <NextExamCard year={year} next={nextExam} today={today} onOpen={onOpen} />
      <section className="cal-card cal-week" aria-labelledby="cal-week-title">
        <header className="cal-card__head">
          <h2 id="cal-week-title" className="cal-card__title">
            This week
          </h2>
          <p className="cal-card__sub">Today to {formatShort(end)}</p>
        </header>
        {days.length ? (
          <DayList
            days={days}
            today={today}
            selectedId={selectedId}
            showCohort={false}
            onOpen={onOpen}
            className="cal-week__list"
          />
        ) : (
          <p className="cal-card__empty">
            {exam && week.length ? 'Nothing else this week.' : `Nothing on the calendar for ${who} this week.`}
          </p>
        )}
      </section>
    </section>
  );
}

interface NextExamCardProps {
  year: CohortYear | null;
  next: NextExam | null;
  today: Date;
  onOpen: (e: CalendarEvent) => void;
}

function NextExamCard({ year, next, today, onOpen }: NextExamCardProps) {
  const { getModule } = useModules();
  if (!next) {
    return (
      <section className="cal-card cal-exam cal-exam--none" aria-label="Your next exam" data-hub="next-exam">
        <EmptyState
          size="sm"
          mate="blink"
          title={year ? `No exams ahead for ${cohortLabel(year)}` : 'No exams ahead'}
          body="Exam dates show up here as soon as they’re announced."
        />
      </section>
    );
  }
  const { exam, unconfirmedBefore, after } = next;
  const date = parseDay(exam.date);
  const days = daysUntil(date, today);
  const module = getModule(exam.moduleId);
  const { code, rest } = splitTitle(exam);
  const name = module ? module.name : rest;
  const where = whenAndWhere(exam) ?? '';
  const earlier = unconfirmedBefore[0];

  return (
    <section
      className={cx('cal-card cal-exam', exam.sample && 'is-unconfirmed')}
      aria-labelledby="cal-exam-title"
      data-hub="next-exam"
    >
      <header className="cal-card__head">
        <h2 id="cal-exam-title" className="cal-card__title">
          <Icon glyph={glyph.exam} className="cal-card__icon" />
          Your next exam
        </h2>
        {year ? <CohortBadge year={year} size="sm" /> : null}
      </header>

      <p className="cal-exam__date">
        <time dateTime={exam.date}>
          {formatLongDay(date)}
          {date.getFullYear() !== today.getFullYear() ? ` ${date.getFullYear()}` : ''}
        </time>
        <span className="visually-hidden">, </span>
        <span className="cal-exam__count">{countdownLabel(days)}</span>
      </p>
      <p className="cal-exam__what">
        {code ? <span className="u-code cal-exam__code">{code}</span> : null}
        <span className="cal-exam__name">{name}</span>
      </p>
      <p className={cx('cal-exam__where', !exam.time && 'is-unset')}>
        <Icon glyph={glyph.clock} />
        <span>{where}</span>
      </p>
      {exam.sample ? (
        <p className="cal-exam__note">
          <span className="cal-unconfirmed">Not confirmed yet</span> Check with the programme office before you plan
          around it.
        </p>
      ) : null}
      {earlier ? (
        <p className="cal-exam__note">
          Before it:{' '}
          <button type="button" className="cal-exam__link" onClick={() => onOpen(earlier)}>
            {earlier.unitCode ?? earlier.title} on {formatShort(parseDay(earlier.date))}
          </button>
          {unconfirmedBefore.length > 1 ? ` and ${unconfirmedBefore.length - 1} more` : ''}, not confirmed yet.
        </p>
      ) : null}

      <div className="cal-exam__foot">
        <span className="cal-exam__after">
          {after ? `${after} more ${after === 1 ? 'exam' : 'exams'} after it` : 'The last exam on the calendar'}
        </span>
        <span className="cal-exam__actions">
          <Button size="sm" onClick={() => onOpen(exam)} aria-label={`Details: ${exam.title}, ${formatLong(date)}`}>
            Details
          </Button>
          <AddToCalendar event={exam} size="sm" />
        </span>
      </div>
    </section>
  );
}
