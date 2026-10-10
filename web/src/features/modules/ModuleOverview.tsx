// Overview tab: the module's shared folders (each opens in a new tab), a way into its library files, progress,
// "Pick up where you left off" and the module's upcoming dates from the calendar.
import { ArrowSquareOut, CalendarBlank, CheckCircle, Files, UploadSimple } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ModuleDetail } from '../../api/types';
import { CONTRIBUTE_URL } from '../../data/people';
import { lessonKey } from '../../lib/modules';
import { cohortColor } from '../../state';
import { Button, Panel, SectionHeader, Skeleton, cx, formatDate } from '../../ui';
import { daysUntil, typeLabel } from '../calendar/public';
import { useModuleDates } from './exams';
import { chapterPosition, lastOpenedLabel, lessonSearch } from './lessons';
import { MiniPoster } from './Poster';
import { computeChapterProgress, type ProgressState, type ResumeKind, type ResumePoint } from './progress';
import { buildResources, joinAnd, type ResourceEntry } from './resources';

const PICKUP_TITLE: Record<ResumeKind, string> = { resume: 'Pick up where you left off', next: 'Up next', start: 'Start the lessons', done: 'All lessons watched' };
const PICKUP_ACTION: Record<ResumeKind, string> = { resume: 'Resume lesson', next: 'Continue', start: 'Start lesson 1', done: 'Watch again' };
const MAX_CHAPTERS = 6;

function ResourceRow({ entry }: { entry: ResourceEntry }) {
  const Icon = entry.icon;
  return (
    <div className={cx('mod-res__entry', `mod-res__entry--${entry.id}`)}>
      <dt className="mod-res__label">
        <Icon weight="duotone" className="mod-res__icon" aria-hidden="true" />
        <span>{entry.label}</span>
      </dt>
      <dd className="mod-res__body">
        {entry.description ? <p className="mod-res__desc">{entry.description}</p> : null}
        {entry.note ? (
          <blockquote className="mod-res__note">
            <p>{entry.note}</p>
          </blockquote>
        ) : null}
        {entry.links.length ? (
          <div className="mod-res__actions">
            {entry.links.map((l) => (
              <Button key={l.href + l.label} size="sm" href={l.href} trailingIcon={ArrowSquareOut} aria-label={l.ariaLabel}>
                {l.label}
              </Button>
            ))}
          </div>
        ) : null}
      </dd>
    </div>
  );
}

function LibraryRow({ count, name, onTab }: { count: number; name: string; onTab: (tab: string) => void }) {
  return (
    <div className="mod-res__entry mod-res__entry--library">
      <dt className="mod-res__label">
        <Files weight="duotone" className="mod-res__icon" aria-hidden="true" />
        <span>In the library</span>
      </dt>
      <dd className="mod-res__body">
        <p className="mod-res__desc">
          {count
            ? `${count} ${count === 1 ? 'file' : 'files'} for ${name}: past papers, students’ notes and guides you can read here or download.`
            : `Past papers, students’ notes and guides for ${name} will be here as students share them.`}
        </p>
        <div className="mod-res__actions">
          <Button size="sm" leadingIcon={Files} onClick={() => onTab('files')}>
            {count ? `See ${count} ${count === 1 ? 'file' : 'files'}` : 'Share a file'}
          </Button>
        </div>
      </dd>
    </div>
  );
}

function PickUp({ module: m, resume }: { module: ModuleDetail; resume: ResumePoint }) {
  const ch = m.chapters[resume.c];
  const video = ch.videos[resume.v];
  const when = resume.kind === 'resume' || resume.kind === 'next' ? lastOpenedLabel(resume.at) : null;
  const whenText = when ? (resume.kind === 'resume' ? `Opened ${when}` : `Last studied ${when}`) : null;
  return (
    <section className="mod-side__section mod-pick" aria-labelledby="mod-pick-title">
      <h2 id="mod-pick-title" className="mod-side__title">
        {PICKUP_TITLE[resume.kind]}
      </h2>
      <Link
        to={lessonSearch(resume.c, resume.v)}
        replace
        className="mod-pick__link"
        aria-label={`${PICKUP_ACTION[resume.kind]}: chapter ${resume.c + 1}, ${ch.title}`}
        onClick={() => window.scrollTo({ top: 0 })}
      >
        <MiniPoster module={m} c={resume.c} v={resume.v} size="lg" />
        <span className="mod-pick__text">
          <span className="mod-pick__pos">{chapterPosition(resume.c, video, resume.v, ch.videos.length)}</span>
          <span className="mod-pick__title">{ch.title}</span>
          {whenText ? <span className="mod-pick__when">{whenText}</span> : null}
        </span>
      </Link>
    </section>
  );
}

function ProgressSection({
  module: m,
  state,
  onOpenLesson,
  onTab,
}: {
  module: ModuleDetail;
  state: ProgressState;
  onOpenLesson: (c: number, v: number) => void;
  onTab: (tab: string) => void;
}) {
  const color = cohortColor(m.year);
  const shown = m.chapters.slice(0, MAX_CHAPTERS);
  const done = m.chapters.filter((_, c) => {
    const cp = computeChapterProgress(state, m, c);
    return cp.total > 0 && cp.watched === cp.total;
  }).length;
  return (
    <section className="mod-side__section mod-prog" aria-labelledby="mod-prog-title">
      <div className="mod-prog__head">
        <h2 id="mod-prog-title" className="mod-side__title">
          Chapters
        </h2>
        <p className="mod-prog__sum">
          <b className="u-tabular">{done}</b> of <span className="u-tabular">{m.chapters.length}</span> complete
        </p>
      </div>
      <ol className="mod-prog__list" role="list">
        {shown.map((ch, c) => {
          const cp = computeChapterProgress(state, m, c);
          const complete = cp.total > 0 && cp.watched === cp.total;
          const firstOpen = ch.videos.findIndex((_, v) => !state.watched[lessonKey(m.id, c, v)]);
          return (
            <li key={c}>
              <button type="button" className={cx('mod-prog__ch', complete && 'is-done')} onClick={() => onOpenLesson(c, firstOpen < 0 ? 0 : firstOpen)}>
                <span className="mod-prog__num u-tabular">{c + 1}</span>
                <span className="mod-prog__name">{ch.title}</span>
                <span className="mod-prog__frac u-tabular">
                  {complete ? <CheckCircle weight="fill" aria-hidden="true" /> : null}
                  {cp.watched}/{cp.total}
                </span>
                <span className="mod-prog__bar" aria-hidden="true">
                  <span style={{ width: `${cp.pct}%`, background: complete ? 'var(--signal)' : color }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {m.chapters.length > MAX_CHAPTERS ? (
        <Button variant="ghost" size="sm" className="mod-prog__all" onClick={() => onTab('lessons')}>
          See all {m.chapters.length} chapters
        </Button>
      ) : null}
    </section>
  );
}

/** The module's next dates on the calendar (exams, mocks, revision sessions, deadlines). */
function UpcomingDates({ module: m }: { module: ModuleDetail }) {
  const { events, isPending, isError } = useModuleDates(m.id, 4);
  const now = new Date();
  return (
    <section className="mod-side__section mod-dates" aria-labelledby="mod-dates-title" data-hub="module-dates">
      <h2 id="mod-dates-title" className="mod-side__title">
        Upcoming dates
      </h2>
      {isPending ? (
        <Skeleton lines={2} />
      ) : isError ? (
        <p className="mod-side__text">The calendar didn’t load. It’s on the Calendar page too.</p>
      ) : events.length ? (
        <ol className="mod-dates__list" role="list">
          {events.map((e) => {
            const days = daysUntil(e.date, now);
            return (
              <li key={e.id}>
                <Link to={`/calendar?event=${encodeURIComponent(e.id)}`} className={cx('mod-dates__row', `mod-dates__row--${e.type}`)}>
                  <span className="mod-dates__dot" aria-hidden="true" />
                  <span className="mod-dates__text">
                    <span className="mod-dates__title">{e.title}</span>
                    <span className="mod-dates__meta">
                      {typeLabel(e.type)}, {formatDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {e.sample ? ', to be confirmed' : ''}
                    </span>
                  </span>
                  <span className={cx('mod-dates__when', days <= 14 && 'is-soon')}>{days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mod-side__text">No dates on the calendar for this module yet.</p>
      )}
      <Button variant="ghost" size="sm" to="/calendar" leadingIcon={CalendarBlank} className="mod-dates__cal">
        Open calendar
      </Button>
    </section>
  );
}

export function ModuleOverview({
  module: m,
  state,
  resume,
  libraryCount,
  onOpenLesson,
  onTab,
}: {
  module: ModuleDetail;
  state: ProgressState;
  resume: ResumePoint | null;
  libraryCount: number;
  onOpenLesson: (c: number, v: number) => void;
  onTab: (tab: string) => void;
}) {
  const { entries, missing } = useMemo(() => buildResources(m), [m]);
  const name = m.unitCode || m.name;

  return (
    <div className="mod-ov">
      <section className="mod-ov__main" aria-labelledby="mod-res-title">
        <SectionHeader
          id="mod-res-title"
          title="Resources"
          description="The module’s shared folders open in a new tab. Files students share are in the library."
          action={
            <Button variant="ghost" size="sm" leadingIcon={Files} onClick={() => onTab('files')}>
              {libraryCount ? `${libraryCount} ${libraryCount === 1 ? 'file' : 'files'} in the library` : 'Files'}
            </Button>
          }
        />
        <Panel as="div" padding="none" className="mod-res" data-hub="module-resources">
          <dl className="mod-res__list">
            {entries.map((e) => (
              <ResourceRow key={e.id} entry={e} />
            ))}
            <LibraryRow count={libraryCount} name={name} onTab={onTab} />
          </dl>
          {missing.length ? (
            <div className="mod-res__missing">
              <p>
                <span className="mod-res__missing-label">No shared folder yet for</span> {joinAnd(missing)}.
              </p>
              <Button size="sm" variant="ghost" leadingIcon={UploadSimple} onClick={() => onTab('files')}>
                Share a file
              </Button>
            </div>
          ) : null}
        </Panel>
      </section>

      <aside className="mod-ov__aside" aria-label="Your study">
        <Panel as="div" padding="none" className="mod-side">
          {resume ? (
            <PickUp module={m} resume={resume} />
          ) : (
            <section className="mod-side__section" aria-labelledby="mod-nolessons-title">
              <h2 id="mod-nolessons-title" className="mod-side__title">
                Know a good playlist?
              </h2>
              <p className="mod-side__text">Suggest videos for {name} and they can be added as lessons here.</p>
              <Button size="sm" href={CONTRIBUTE_URL} trailingIcon={ArrowSquareOut} aria-label="Suggest a playlist on GitHub (opens in a new tab)">
                Suggest a playlist
              </Button>
            </section>
          )}
          {resume ? <ProgressSection module={m} state={state} onOpenLesson={onOpenLesson} onTab={onTab} /> : null}
          <UpcomingDates module={m} />
        </Panel>
      </aside>
    </div>
  );
}
