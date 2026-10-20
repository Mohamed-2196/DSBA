// Exam week (IDEA-48): in the days before a student's exam, Home on a phone leads with it instead of the desk shelf:
// the exam itself (its day, time and place, and Blink holding up the days left), what to practise, the latest past
// papers and the module's other dates, in the order Site settings give (examWeek.lead). A part with nothing to show
// is left out; each has its own loading and error state.
import { useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { daysUntil, formatDay, formatLongDay, parseDay } from '../../lib/dates';
import { Button, Deskmate, Icon, QueryError, Skeleton, countOf, cx, glyph } from '../../ui';
import { dateLabel, type CalendarEvent } from '../calendar/public';
import {
  SittingsTable,
  libraryItemPath,
  libraryTimeMeHref,
  useModuleQuestions,
  usePaperSittings,
} from '../library/public';
import { lessonHref, moduleDetailQuery } from '../modules/public';
import { examDayWord, moduleDatesAhead, mostAskedChapter, practiceLinks, type ExamWeekPart } from './examWeek';
import type { SessionEvent } from './session';

const SITTINGS = 2;

function Part({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="home-exam__part">
      <div className="home-exam__part-head">
        <h3 className="home-exam__part-title">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Loading({ title }: { title: string }) {
  return (
    <Part title={title}>
      <div aria-busy="true">
        <span className="visually-hidden" role="status">
          Loading
        </span>
        <Skeleton lines={2} />
      </div>
    </Part>
  );
}

function Countdown({ exam }: { exam: SessionEvent }) {
  const name = exam.module ? exam.module.name : exam.title;
  const code = exam.unitCode || exam.module?.unitCode || null;
  const to = exam.moduleId ? `/modules/${exam.moduleId}` : `/calendar?event=${encodeURIComponent(exam.id)}`;
  const where = [exam.time, exam.place].filter(Boolean).join(', ');
  return (
    <div className="home-next home-next--exam home-exam__count" data-hub="home-exam-countdown">
      <p className="home-next__count" aria-hidden="true">
        {exam.days > 1 ? (
          <>
            <span className="home-next__days u-display-num">{exam.days}</span>
            <span className="home-next__unit">days to go</span>
          </>
        ) : (
          <span className="home-next__soon">{exam.days === 1 ? 'Tomorrow' : 'Today'}</span>
        )}
      </p>
      <Deskmate mate="blink" state="countdown" count={Math.max(0, exam.days)} size={80} className="home-next__mate" />
      <div className="home-next__text">
        <Link to={to} className="home-next__name">
          {code ? <span className="home-next__code u-code">{code}</span> : null}
          {name}
        </Link>
        <p className="home-next__when">
          <time dateTime={exam.date}>{formatLongDay(exam.when)}</time>
          <span className="visually-hidden">
            , {exam.days > 1 ? `in ${exam.days} days` : exam.days === 1 ? 'tomorrow' : 'today'}
          </span>
        </p>
        <p className="home-next__rest">{where || 'Time and place not set yet.'}</p>
      </div>
    </div>
  );
}

function Practice({ moduleId }: { moduleId: string }) {
  const { featureOn } = useAuth();
  const questionsOn = featureOn('library.questions');
  const sittings = usePaperSittings(moduleId);
  const questions = useModuleQuestions(moduleId, { enabled: questionsOn });
  const detail = useQuery({ ...moduleDetailQuery(moduleId), enabled: questionsOn });
  const title = 'Practise';
  if (sittings.isPending || (questionsOn && questions.isPending)) return <Loading title={title} />;
  if (sittings.isError || questions.isError) {
    const failed = sittings.isError ? sittings : questions;
    return (
      <Part title={title}>
        <QueryError
          error={failed.error}
          title="The past papers didn’t load"
          size="sm"
          panel={false}
          onRetry={() => void failed.refetch()}
          retrying={failed.isFetching}
        />
      </Part>
    );
  }
  const links = practiceLinks(sittings.data.sittings);
  const asked = questionsOn ? mostAskedChapter(questions.data ?? []) : null;
  const chapter = asked ? detail.data?.chapters.find((c) => c.id === asked.chapterId) : undefined;
  const firstLesson = chapter?.videos[0];
  const askedTo = firstLesson
    ? lessonHref(moduleId, firstLesson.id)
    : `/modules/${encodeURIComponent(moduleId)}?tab=lessons`;
  if (!links.paper && !links.answers && !links.report && !asked) return null;
  return (
    <Part title={title}>
      <div className="home-exam__actions">
        {links.paper ? (
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Icon glyph={glyph.timer} />}
            to={libraryTimeMeHref(links.paper)}
          >
            Time the {links.paper.label} paper
          </Button>
        ) : null}
        {links.answers ? (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Icon glyph={glyph.check} />}
            to={libraryItemPath(links.answers)}
          >
            Worked answers
          </Button>
        ) : null}
        {links.report ? (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Icon glyph={glyph.page} />}
            to={libraryItemPath(links.report)}
          >
            Examiners’ report
          </Button>
        ) : null}
      </div>
      {asked ? (
        <p className="home-exam__asked">
          Most asked:{' '}
          <Link to={askedTo} className="home-exam__link">
            {asked.title}
          </Link>
          , {countOf(asked.count, 'past question')}
        </p>
      ) : null}
    </Part>
  );
}

function Papers({ moduleId }: { moduleId: string }) {
  const q = usePaperSittings(moduleId);
  const { featureOn } = useAuth();
  const location = useLocation();
  const linkState = useMemo(() => ({ from: `${location.pathname}${location.search}` }), [location]);
  const title = 'Latest past papers';
  if (q.isPending) return <Loading title={title} />;
  if (q.isError) {
    return (
      <Part title={title}>
        <QueryError
          error={q.error}
          title="The past papers didn’t load"
          size="sm"
          panel={false}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      </Part>
    );
  }
  const { sittings } = q.data;
  if (!sittings.length) return null;
  return (
    <Part
      title={title}
      action={
        <Button variant="ghost" size="sm" to={`/modules/${encodeURIComponent(moduleId)}?tab=files#papers`}>
          {sittings.length > SITTINGS ? `All ${sittings.length}` : 'All papers'}
        </Button>
      }
    >
      <SittingsTable sittings={sittings.slice(0, SITTINGS)} linkState={linkState} board={featureOn('board')} />
    </Part>
  );
}

function Dates({ events, exam, todayIs }: { events: readonly CalendarEvent[]; exam: SessionEvent; todayIs: string }) {
  const rows = moduleDatesAhead(events, exam, todayIs);
  if (!rows.length) return null;
  return (
    <Part title="The module’s dates">
      <ol role="list" className="home-exam__dates">
        {rows.map((e) => {
          const day = parseDay(e.date);
          const days = daysUntil(day, parseDay(todayIs));
          return (
            <li key={e.id}>
              <Link to={`/calendar?event=${encodeURIComponent(e.id)}`} className="home-exam__date">
                <span className={cx('home-exam__dot', `home-exam__dot--${e.type}`)} aria-hidden="true" />
                <span className="home-exam__date-text">
                  <span className="home-exam__date-title">{e.title}</span>
                  <span className="home-exam__date-meta">
                    {dateLabel(e)}, {formatDay(day, { weekday: 'short', month: 'short', year: false })}
                  </span>
                </span>
                <span className="home-exam__date-when">
                  {days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Part>
  );
}

export function ExamWeekLead({
  exam,
  lead,
  events,
  todayIs,
}: {
  exam: SessionEvent;
  lead: readonly ExamWeekPart[];
  /** the calendar Home already loaded (the module's dates come from it) */
  events: readonly CalendarEvent[];
  todayIs: string;
}) {
  const { featureOn } = useAuth();
  const code = exam.unitCode || exam.module?.unitCode || exam.module?.shortName || exam.title;
  const moduleId = exam.moduleId;
  const libraryOn = featureOn('library');
  const part = (p: ExamWeekPart): ReactNode => {
    switch (p) {
      case 'countdown':
        return <Countdown key={p} exam={exam} />;
      case 'practice':
        return moduleId && libraryOn ? <Practice key={p} moduleId={moduleId} /> : null;
      case 'papers':
        return moduleId && libraryOn ? <Papers key={p} moduleId={moduleId} /> : null;
      case 'dates':
        return <Dates key={p} events={events} exam={exam} todayIs={todayIs} />;
    }
  };
  return (
    <section className="home-exam" aria-labelledby="home-exam-title" data-hub="home-exam-week">
      <h2 id="home-exam-title" className="home-exam__title">
        <span className="home-exam__eyebrow">
          Exam week<span className="visually-hidden">:</span>
        </span>
        {code} {exam.resit ? 'resit ' : ''}
        {examDayWord(exam.days, exam.when)}
      </h2>
      {lead.map(part)}
    </section>
  );
}
