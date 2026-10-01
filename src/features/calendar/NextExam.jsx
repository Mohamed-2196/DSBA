import { CalendarCheck, DownloadSimple } from '@phosphor-icons/react';
import { Button, CohortBadge, EmptyState, ModuleIcon } from '../../ui';
import { cohortColor, cohortLabel } from '../../state';
import { formatDayMonth, formatLong, parseKey } from './dates.js';
import { eventModule, splitTitle } from './eventMeta.js';
import { getExamSession, getNextExam } from './queries.js';
import { SessionStrip } from './SessionStrip.jsx';

/**
 * The countdown to the next exam for the student's year: the unit code as the anchor, the session
 * timeline under it. data-pulse="next-exam".
 */
export function NextExam({ year, now, onOpen, onDownload, onShowAllYears }) {
  const next = getNextExam({ year, from: now });

  if (!next) {
    return (
      <section className="cal-next cal-next--empty" data-pulse="next-exam" aria-label="Next exam">
        <EmptyState
          size="sm"
          icon={CalendarCheck}
          title={year ? `No exams on the calendar for ${cohortLabel(year)}` : 'No exams on the calendar'}
          body="Exam dates show up here, with a countdown, as soon as they're announced."
          action={year && onShowAllYears ? <Button size="sm" onClick={onShowAllYears}>See every year’s exams</Button> : null}
        />
      </section>
    );
  }

  const session = getExamSession(next, { year });
  const module = eventModule(next);
  const date = parseKey(next.date);
  const name = module ? module.name : splitTitle(next).rest;
  const first = parseKey(session[0].date);
  const last = parseKey(session[session.length - 1].date);
  const position = session.findIndex((e) => e.id === next.id) + 1;

  return (
    <section className="cal-next" data-pulse="next-exam" aria-labelledby="cal-next-title">
      <p className="cal-next__kicker">
        <span>Your next exam</span>
        {year ? <CohortBadge year={year} size="sm" /> : null}
      </p>
      <div className="cal-next__actions">
        <Button variant="primary" leadingIcon={DownloadSimple} onClick={() => onDownload(next)}>
          Add to calendar
        </Button>
        {module ? (
          <Button to={`/modules/${module.id}`} leadingIcon={<ModuleIcon moduleId={module.id} />}>
            Open module
          </Button>
        ) : null}
      </div>

      <div className="cal-next__id">
        {next.unitCode ? (
          <p className="cal-next__code u-code" aria-hidden="true" style={{ color: cohortColor(next.year) }}>
            {next.unitCode}
          </p>
        ) : null}
        <div className="cal-next__name">
          <h2 id="cal-next-title">
            {next.unitCode ? <span className="visually-hidden">{next.unitCode} </span> : null}
            {name}
          </h2>
          <p className="cal-next__date">{formatLong(date)}</p>
        </div>
      </div>

      {session.length > 1 ? (
        <p className="cal-next__session">
          Exam {position} of {session.length} in this session, {formatDayMonth(first)} to {formatDayMonth(last)}
        </p>
      ) : null}
      <SessionStrip session={session} next={next} now={now} onOpen={onOpen} />
    </section>
  );
}
