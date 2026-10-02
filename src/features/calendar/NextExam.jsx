import { CalendarCheck, CalendarPlus } from '@phosphor-icons/react';
import { Button, CohortBadge, EmptyState, ModuleIcon } from '../../ui';
import { cohortLabel, cohortTextColor } from '../../state';
import { formatLong, formatLongDay, parseKey, startOfDay } from './dates.js';
import { eventModule, splitTitle } from './eventMeta.js';
import { ExamBoard } from './ExamBoard.jsx';
import { ExamTrack } from './ExamTrack.jsx';
import { getExamSession, getNextExam } from './queries.js';

/**
 * The top of the calendar: the date of the next exam with its weekday as the headline, the road to
 * it drawn to scale (ExamTrack), then every exam of the session as a date leaf (ExamBoard).
 * data-hub="next-exam".
 */
export function NextExam({ year, now, onOpen, onDownload, onShowAllYears }) {
  const next = getNextExam({ year, from: now });

  if (!next) {
    return (
      <section className="cal-next cal-next--empty" data-hub="next-exam" aria-label="Next exam">
        <EmptyState
          size="sm"
          icon={CalendarCheck}
          title={year ? `No exams on the calendar for ${cohortLabel(year)}` : 'No exams on the calendar'}
          body="Exam dates show up here, with the day of the week and a countdown, as soon as they're announced."
          action={year && onShowAllYears ? <Button size="sm" onClick={onShowAllYears}>See every year’s exams</Button> : null}
        />
      </section>
    );
  }

  const today = startOfDay(now);
  const session = getExamSession(next, { year });
  const upcoming = session.filter((e) => parseKey(e.date) >= today);
  const module = eventModule(next);
  const date = parseKey(next.date);
  const name = module ? module.name : splitTitle(next).rest;
  const position = session.findIndex((e) => e.id === next.id) + 1;

  return (
    <section className="cal-next" data-hub="next-exam" aria-labelledby="cal-next-title">
      <div className="cal-next__top">
        <p className="cal-next__kicker">
          <span>Your next exam</span>
          {year ? <CohortBadge year={year} size="sm" /> : null}
          {session.length > 1 ? (
            <span className="cal-next__of">
              {position} of {session.length} in this session
            </span>
          ) : null}
        </p>
        <div className="cal-next__actions">
          <Button variant="primary" leadingIcon={CalendarPlus} onClick={() => onDownload(next)}>
            Add to calendar
          </Button>
          {module ? (
            <Button to={`/modules/${module.id}`} leadingIcon={<ModuleIcon moduleId={module.id} />}>
              Open module
            </Button>
          ) : null}
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
      </p>
      <h2 id="cal-next-title" className="cal-next__module">
        {next.unitCode ? (
          <span className="cal-next__code u-code" style={{ color: cohortTextColor(next.year) }}>
            {next.unitCode}
          </span>
        ) : null}
        <span>{name}</span>
      </h2>

      <ExamTrack exams={upcoming} now={now} />
      <ExamBoard session={session} next={next} today={today} onOpen={onOpen} onDownload={onDownload} />
    </section>
  );
}
