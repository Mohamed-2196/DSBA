// Overview tab: the module's shelves (books, past papers, notes, ... each opening the Files tab at its part), a way to
// share a file (decision D6: contributing means uploading), progress, "Pick up where you left off" and the module's
// upcoming dates from the calendar.
import { CalendarBlank, CheckCircle, Files, UploadSimple } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ModuleDetail } from '../../api/types';
import { useAuth } from '../../auth';
import { cohortColor } from '../../state';
import { Badge, Button, Panel, SectionHeader, Skeleton, countOf, cx, formatDate } from '../../ui';
import { daysUntil } from '../../lib/dates';
import { typeLabel } from '../calendar/public';
import { useModuleDates } from './exams';
import { chapterPosition, lastOpenedLabel, lessonHref } from './lessons';
import { MiniPoster } from './Poster';
import { computeChapterProgress, type ProgressState, type ResumeKind, type ResumePoint } from './progress';
import { buildShelves, joinAnd, type Shelf } from './resources';

const PICKUP_TITLE: Record<ResumeKind, string> = { resume: 'Pick up where you left off', next: 'Up next', start: 'Start the lessons', done: 'All lessons watched' };
const PICKUP_ACTION: Record<ResumeKind, string> = { resume: 'Resume lesson', next: 'Continue', start: 'Start lesson 1', done: 'Watch again' };
const MAX_CHAPTERS = 6;

function ShelfRow({ shelf, onTab }: { shelf: Shelf; onTab: (tab: string, hash?: string) => void }) {
  const Icon = shelf.icon;
  return (
    <div className={cx('mod-res__entry', `mod-res__entry--${shelf.kind}`)} data-hub="module-shelf">
      <dt className="mod-res__label">
        <Icon weight="duotone" className="mod-res__icon" aria-hidden="true" />
        <span>{shelf.label}</span>
      </dt>
      <dd className="mod-res__body">
        <p className="mod-res__desc">{shelf.beingAdded ? 'Being added: these files are on their way into the Hub. Check back soon.' : shelf.description}</p>
        <div className="mod-res__actions">
          {shelf.beingAdded ? (
            <Badge tone="neutral" size="sm">
              Being added
            </Badge>
          ) : (
            <Button size="sm" leadingIcon={Files} onClick={() => onTab('files', shelf.hash)} aria-label={`${shelf.label}: ${countOf(shelf.files, 'file')}`}>
              {shelf.kind === 'past-paper' ? 'See past papers' : `Open ${countOf(shelf.files, 'file')}`}
            </Button>
          )}
        </div>
      </dd>
    </div>
  );
}

function LibraryRow({ count, name, onTab, onUpload }: { count: number | null; name: string; onTab: (tab: string) => void; onUpload: (() => void) | null }) {
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
          {count ? (
            <Button size="sm" leadingIcon={Files} onClick={() => onTab('files')}>
              See {count} {count === 1 ? 'file' : 'files'}
            </Button>
          ) : onUpload ? (
            <Button size="sm" leadingIcon={UploadSimple} onClick={onUpload}>
              Upload a file
            </Button>
          ) : null}
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
        to={lessonHref(m.id, ch.videos[resume.v].id)}
        replace
        className="mod-pick__link"
        aria-label={`${PICKUP_ACTION[resume.kind]}: chapter ${resume.c + 1}, ${ch.title}`}
        onClick={() => window.scrollTo({ top: 0 })}
      >
        <MiniPoster module={m} video={video} size="lg" />
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
  tracking,
  onOpenLesson,
  onTab,
}: {
  module: ModuleDetail;
  state: ProgressState;
  /** Off: the chapters without what was watched. */
  tracking: boolean;
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
        {tracking ? (
          <p className="mod-prog__sum">
            <b className="u-tabular">{done}</b> of <span className="u-tabular">{m.chapters.length}</span> complete
          </p>
        ) : null}
      </div>
      <ol className="mod-prog__list" role="list">
        {shown.map((ch, c) => {
          const cp = computeChapterProgress(state, m, c);
          const complete = cp.total > 0 && cp.watched === cp.total;
          const firstOpen = ch.videos.findIndex((video) => !state.watched[video.id]);
          return (
            <li key={c}>
              <button type="button" className={cx('mod-prog__ch', complete && 'is-done')} onClick={() => onOpenLesson(c, firstOpen < 0 ? 0 : firstOpen)}>
                <span className="mod-prog__num u-tabular">{c + 1}</span>
                <span className="mod-prog__name">{ch.title}</span>
                {tracking ? (
                  <>
                    <span className="mod-prog__frac u-tabular">
                      {complete ? <CheckCircle weight="fill" aria-hidden="true" /> : null}
                      {cp.watched}/{cp.total}
                    </span>
                    <span className="mod-prog__bar" aria-hidden="true">
                      <span style={{ width: `${cp.pct}%`, background: complete ? 'var(--signal)' : color }} />
                    </span>
                  </>
                ) : (
                  <span className="mod-prog__frac u-tabular">{countOf(cp.total, 'lesson')}</span>
                )}
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
  tracking,
  resume,
  libraryCount,
  onOpenLesson,
  onTab,
  onUpload,
}: {
  module: ModuleDetail;
  state: ProgressState;
  tracking: boolean;
  resume: ResumePoint | null;
  /** null while the library is switched off */
  libraryCount: number | null;
  onOpenLesson: (c: number, v: number) => void;
  onTab: (tab: string, hash?: string) => void;
  /** Open the library's upload dialog for this module (guests sign in first); null while uploading isn't offered. */
  onUpload: (() => void) | null;
}) {
  const { featureOn } = useAuth();
  const libraryOn = featureOn('library');
  const { shelves, missing } = useMemo(() => buildShelves(m), [m]);
  const name = m.unitCode || m.name;

  return (
    <div className="mod-ov">
      <section className="mod-ov__main" aria-labelledby="mod-res-title">
        <SectionHeader
          id="mod-res-title"
          title="Resources"
          description="Everything opens here in the Hub: read it in your browser or download it."
          action={
            libraryOn ? (
              <Button variant="ghost" size="sm" leadingIcon={Files} onClick={() => onTab('files')} className="mod-ov__files">
                {libraryCount ? `${libraryCount} ${libraryCount === 1 ? 'file' : 'files'} in the library` : 'Files'}
              </Button>
            ) : undefined
          }
        />
        <Panel as="div" padding="none" className="mod-res" data-hub="module-resources">
          <dl className="mod-res__list">
            {shelves.map((sh) => (
              <ShelfRow key={sh.kind} shelf={sh} onTab={onTab} />
            ))}
            {libraryOn && !shelves.length ? <LibraryRow count={libraryCount} name={name} onTab={onTab} onUpload={onUpload} /> : null}
          </dl>
          {libraryOn && missing.length ? (
            <div className="mod-res__missing">
              <p>
                <span className="mod-res__missing-label">Nobody has shared</span> {joinAnd(missing)} for {name} yet.
              </p>
              {onUpload ? (
                <Button size="sm" variant="ghost" leadingIcon={UploadSimple} onClick={onUpload}>
                  Upload a file
                </Button>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </section>

      <aside className="mod-ov__aside" aria-label="Your study">
        <Panel as="div" padding="none" className="mod-side">
          {resume ? (
            <PickUp module={m} resume={resume} />
          ) : onUpload ? (
            <section className="mod-side__section" aria-labelledby="mod-nolessons-title">
              <h2 id="mod-nolessons-title" className="mod-side__title">
                Have notes for {name}?
              </h2>
              <p className="mod-side__text">Share your notes, a cheat sheet or a past paper. A student rep checks every upload before it appears.</p>
              <Button size="sm" leadingIcon={UploadSimple} onClick={onUpload}>
                Upload a file
              </Button>
            </section>
          ) : null}
          {resume ? <ProgressSection module={m} state={state} tracking={tracking} onOpenLesson={onOpenLesson} onTab={onTab} /> : null}
          {featureOn('calendar') ? <UpcomingDates module={m} /> : null}
        </Panel>
      </aside>
    </div>
  );
}
