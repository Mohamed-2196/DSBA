// Home's "Coming up": the next exam (or mock, or other date) said plainly, with how many days are left, then the
// next dates on the calendar for the year (the calendar's own list).
import { Link } from 'react-router-dom';
import type { CohortYear } from '../../state';
import { QueryError, Skeleton } from '../../ui';
import { UpcomingEvents, typeLabel } from '../calendar/public';
import { formatDay, formatLongDay } from '../../lib/dates';
import type { ExamSession, SessionEvent } from './session';
import { numberWord } from './time';

const LABEL: Record<string, string> = { exam: 'Next exam', mock: 'Next mock exam' };

/** What follows the next exam in the same session: 'Then five more exams, until 30 January.' */
function restLine(session: ExamSession): string | null {
  const rest = session.exams.slice(1);
  const last = rest[rest.length - 1];
  if (session.kind !== 'exams' || !last) return null;
  const exams = rest.filter((e) => e.type === 'exam').length;
  const mocks = rest.length - exams;
  const parts = [mocks ? `${numberWord(mocks)} ${mocks === 1 ? 'mock' : 'mocks'}` : null, exams ? `${numberWord(exams)} more ${exams === 1 ? 'exam' : 'exams'}` : null].filter(Boolean);
  return `Then ${parts.join(' and ')}, until ${formatDay(last.when, { year: false })}.`;
}

function NextDate({ next, session }: { next: SessionEvent; session: ExamSession }) {
  const name = next.module ? next.module.name : next.title;
  const code = next.unitCode || next.module?.unitCode || null;
  const to = next.moduleId ? `/modules/${next.moduleId}` : `/calendar?event=${encodeURIComponent(next.id)}`;
  const rest = restLine(session);
  return (
    <div className="home-next" data-hub="home-next-exam">
      <p className="home-next__count" aria-hidden="true">
        {next.days > 1 ? (
          <>
            <span className="home-next__days u-tabular">{next.days}</span>
            <span className="home-next__unit">days</span>
          </>
        ) : (
          <span className="home-next__soon">{next.days === 1 ? 'Tomorrow' : 'Today'}</span>
        )}
      </p>
      <div className="home-next__text">
        <p className="home-next__label">{LABEL[next.type] ?? typeLabel(next.type)}</p>
        <Link to={to} className="home-next__name">
          {code ? <span className="home-next__code u-code">{code}</span> : null}
          {name}
        </Link>
        <p className="home-next__when">
          <time dateTime={next.date}>{formatLongDay(next.when)}</time>
          <span className="visually-hidden">, {next.days > 1 ? `in ${next.days} days` : next.days === 1 ? 'tomorrow' : 'today'}</span>
        </p>
        {rest ? <p className="home-next__rest">{rest}</p> : null}
      </div>
    </div>
  );
}

export function ComingUp({
  session,
  year,
  loading,
  error,
  onRetry,
  retrying,
}: {
  session: ExamSession | null;
  year: CohortYear;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  let head;
  if (loading) {
    head = (
      <div className="home-next" aria-hidden="true">
        <Skeleton width={72} height={72} radius={12} />
        <div className="home-next__text">
          <Skeleton width="30%" height={12} />
          <Skeleton width="70%" height={18} />
          <Skeleton width="45%" height={14} />
        </div>
      </div>
    );
  } else if (error) {
    head = <QueryError error={error} title="Your next exam didn’t load" size="sm" panel={false} onRetry={onRetry} retrying={retrying} />;
  } else if (session) {
    head = <NextDate next={session.next} session={session} />;
  } else head = null;
  return (
    <div className="home-coming">
      {head}
      <UpcomingEvents n={4} year={year} />
    </div>
  );
}
