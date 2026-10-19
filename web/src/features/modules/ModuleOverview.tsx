// Overview tab: the module's home. What to carry on with (the papers, notes and lessons opened last), then previews
// of what the other tabs and the calendar hold, each ending in a link to the whole of it: the next dates, lesson
// progress (for a student who keeps it and has started), the student's own notes about the module, the latest
// sittings of past papers, the newest students' notes, the newest threads with "Ask a question", and the rest of the
// library (decision D6: contributing means uploading). A block with nothing to show is left out, not shown empty: a
// student with no notes about the module gets "New note" on the lesson progress or Carry on block instead (or, with
// neither, a one-line Your notes block).
import { CalendarBlank, ChatsCircle, CheckCircle, Files, NotePencil, Plus, UploadSimple } from '@phosphor-icons/react';
import { useId, useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ModuleDetail } from '../../api/types';
import { useAuth } from '../../auth';
import { daysUntil, formatDay, todayKey } from '../../lib/dates';
import { cohortColor } from '../../state';
import { Badge, Button, Panel, QueryError, Skeleton, countOf, cx, timeAgo } from '../../ui';
import { aheadRows, typeLabel } from '../calendar/public';
import { CarryOn, useCarryOn } from '../carryon/public';
import { useModuleLatestThreads, useStartsThreads } from '../forum/public';
import { SittingsTable, libraryItemPath, usePaperSittings } from '../library/public';
import { NoteName, useModuleNotes, useStartNote } from '../notes/public';
import { useModuleFiles } from './api';
import { useModuleDates } from './exams';
import { chapterPosition, lastOpenedLabel, lessonHref, moduleTabOn } from './lessons';
import { sharedBy, showsProgress } from './overview';
import { MiniPoster } from './Poster';
import { computeChapterProgress, type ProgressState, type ResumeKind, type ResumePoint } from './progress';
import { buildShelves, joinAnd } from './resources';

const PICKUP_TITLE: Record<ResumeKind, string> = {
  resume: 'Pick up where you left off',
  next: 'Up next',
  start: 'Start the lessons',
  done: 'All lessons watched',
};
const PICKUP_ACTION: Record<ResumeKind, string> = {
  resume: 'Resume lesson',
  next: 'Continue',
  start: 'Start lesson 1',
  done: 'Watch again',
};
const MAX_CHAPTERS = 6;
const SITTINGS = 3;
const ROWS = 3;

/** One preview: a titled card, its rows, and links to the whole of it. */
function Block({
  title,
  className,
  footer,
  children,
  hub,
}: {
  title: string;
  className?: string;
  footer?: ReactNode;
  children: ReactNode;
  hub: string;
}) {
  const id = useId();
  return (
    <Panel padding="none" className={cx('mod-blk', className)} aria-labelledby={id} data-hub={hub}>
      <h2 id={id} className="mod-blk__title">
        {title}
      </h2>
      <div className="mod-blk__body">{children}</div>
      {footer ? <div className="mod-blk__foot">{footer}</div> : null}
    </Panel>
  );
}

function BlockLoading({ title }: { title: string }) {
  return (
    <Block title={title} hub="module-block-loading">
      <div className="mod-blk__loading" aria-busy="true">
        <span className="visually-hidden" role="status">
          Loading
        </span>
        <Skeleton lines={3} />
      </div>
    </Block>
  );
}

/** The module's next dates on the calendar: exams, mocks, deadlines and VLE windows (an open one by its last day). */
function NextDates({ module: m }: { module: ModuleDetail }) {
  const { events, isPending, isError, error, isFetching, refetch } = useModuleDates(m.id, 12);
  const today = todayKey();
  const rows = useMemo(() => aheadRows(events, today).slice(0, ROWS), [events, today]);
  const title = 'Next dates';
  if (isPending) return <BlockLoading title={title} />;
  if (isError) {
    return (
      <Block title={title} hub="module-dates">
        <QueryError
          error={error}
          title="The calendar didn’t load"
          size="sm"
          panel={false}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </Block>
    );
  }
  if (!rows.length) return null;
  return (
    <Block
      title={title}
      hub="module-dates"
      footer={
        <Button variant="ghost" size="sm" to="/calendar" leadingIcon={CalendarBlank}>
          Open the calendar
        </Button>
      }
    >
      <ol className="mod-rows" role="list">
        {rows.map(({ event: e, day, closes }) => {
          const days = daysUntil(day, today);
          const date = formatDay(day, { weekday: 'short', month: 'short', year: false });
          return (
            <li key={e.id}>
              <Link
                to={`/calendar?event=${encodeURIComponent(e.id)}`}
                className={cx('mod-row', 'mod-date', `mod-date--${e.type}`)}
              >
                <span className="mod-date__dot" aria-hidden="true" />
                <span className="mod-row__text">
                  <span className="mod-row__title">{e.title}</span>
                  <span className="mod-row__meta">
                    {closes ? `Closes ${date}` : `${typeLabel(e.type)}, ${date}`}
                    {e.sample ? ', to be confirmed' : ''}
                  </span>
                </span>
                <span className={cx('mod-date__when', days <= 14 && 'is-soon')}>
                  {days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Block>
  );
}

function YourProgress({
  module: m,
  state,
  resume,
  onOpenLesson,
  onTab,
  extra,
}: {
  module: ModuleDetail;
  state: ProgressState;
  resume: ResumePoint;
  onOpenLesson: (c: number, v: number) => void;
  onTab: (tab: string) => void;
  /** one more action in the footer ("New note") */
  extra?: ReactNode;
}) {
  const ch = m.chapters[resume.c];
  const video = ch.videos[resume.v];
  const when = resume.kind === 'resume' || resume.kind === 'next' ? lastOpenedLabel(resume.at) : null;
  const whenText = when ? (resume.kind === 'resume' ? `Opened ${when}` : `Last studied ${when}`) : null;
  const color = cohortColor(m.year);
  const done = m.chapters.filter((_, c) => {
    const cp = computeChapterProgress(state, m, c);
    return cp.total > 0 && cp.watched === cp.total;
  }).length;
  return (
    <Block
      title={PICKUP_TITLE[resume.kind]}
      className="mod-blk--progress"
      hub="module-progress"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onTab('lessons')}>
            All {countOf(m.chapters.length, 'chapter')}
          </Button>
          {extra}
        </>
      }
    >
      <Link
        to={lessonHref(m.id, video.id)}
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
      <p className="mod-prog__sum">
        <b className="u-tabular">{done}</b> of <span className="u-tabular">{m.chapters.length}</span> chapters complete
      </p>
      <ol className="mod-prog__list" role="list">
        {m.chapters.slice(0, MAX_CHAPTERS).map((chapter, c) => {
          const cp = computeChapterProgress(state, m, c);
          const complete = cp.total > 0 && cp.watched === cp.total;
          const firstOpen = chapter.videos.findIndex((v) => !state.watched[v.id]);
          return (
            <li key={chapter.id}>
              <button
                type="button"
                className={cx('mod-prog__ch', complete && 'is-done')}
                onClick={() => onOpenLesson(c, firstOpen < 0 ? 0 : firstOpen)}
              >
                <span className="mod-prog__num u-tabular">{c + 1}</span>
                <span className="mod-prog__name">{chapter.title}</span>
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
    </Block>
  );
}

/** The latest sittings in the library's past papers table, the Files tab for all of them. */
function LatestPapers({ moduleId, onTab }: { moduleId: string; onTab: (tab: string, hash?: string) => void }) {
  const q = usePaperSittings(moduleId);
  const { featureOn } = useAuth();
  const location = useLocation();
  const linkState = useMemo(() => ({ from: `${location.pathname}${location.search}` }), [location]);
  const title = 'Latest past papers';
  if (q.isPending) return <BlockLoading title={title} />;
  if (q.isError) {
    return (
      <Block title={title} hub="module-papers">
        <QueryError
          error={q.error}
          title="The past papers didn’t load"
          size="sm"
          panel={false}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      </Block>
    );
  }
  const { sittings } = q.data;
  if (!sittings.length) return null;
  return (
    <Block
      title={title}
      hub="module-papers"
      footer={
        <Button variant="ghost" size="sm" leadingIcon={Files} onClick={() => onTab('files', 'papers')}>
          {sittings.length > SITTINGS ? `All ${sittings.length} sittings` : 'All past papers'}
        </Button>
      }
    >
      <SittingsTable
        sittings={sittings.slice(0, SITTINGS)}
        linkState={linkState}
        board={featureOn('board')}
        className="mod-papers"
      />
    </Block>
  );
}

/** The student's own notes about the module, last edited first. Shown only once there is one (see ModuleOverview). */
function YourNotes({
  moduleId,
  notes,
  newNote,
}: {
  moduleId: string;
  notes: ReturnType<typeof useModuleNotes>;
  newNote: ReactNode;
}) {
  const title = 'Your notes';
  if (notes.isPending) return <BlockLoading title={title} />;
  if (notes.isError) {
    return (
      <Block title={title} hub="module-your-notes">
        <QueryError
          error={notes.error}
          title="Your notes didn’t load"
          size="sm"
          panel={false}
          onRetry={() => void notes.refetch()}
          retrying={notes.isFetching}
        />
      </Block>
    );
  }
  const { items, total } = notes.data;
  return (
    <Block
      title={title}
      hub="module-your-notes"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={NotePencil}
            to={`/notes?module=${encodeURIComponent(moduleId)}`}
          >
            {total > items.length ? `All ${total} notes` : 'All your notes'}
          </Button>
          {newNote}
        </>
      }
    >
      <ul className="mod-rows" role="list">
        {items.map((n) => (
          <li key={n.id}>
            <Link to={`/notes/${n.id}`} className="mod-row">
              <span className="mod-row__text">
                <span className="mod-row__title" dir="auto">
                  <NoteName note={n} />
                </span>
                <span className="mod-row__meta">Edited {timeAgo(n.updatedAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  );
}

/** "New note" with no notes yet and nowhere else to put it: one line about notes, and the button. */
function NoNotes({ name, newNote }: { name: string; newNote: ReactNode }) {
  return (
    <Block title="Your notes" hub="module-your-notes" footer={newNote}>
      <p className="mod-blk__note">Write notes about {name} here. Only you see them.</p>
    </Block>
  );
}

function NewestNotes({ moduleId, onTab }: { moduleId: string; onTab: (tab: string, hash?: string) => void }) {
  const q = useModuleFiles(moduleId, 'notes', { limit: ROWS });
  const title = 'Students’ notes';
  if (q.isPending) return <BlockLoading title={title} />;
  if (q.isError) {
    return (
      <Block title={title} hub="module-notes">
        <QueryError
          error={q.error}
          title="The notes didn’t load"
          size="sm"
          panel={false}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      </Block>
    );
  }
  const notes = q.data;
  if (!notes.length) return null;
  return (
    <Block
      title={title}
      hub="module-notes"
      footer={
        <Button variant="ghost" size="sm" leadingIcon={Files} onClick={() => onTab('files', 'files-notes')}>
          All notes
        </Button>
      }
    >
      <ul className="mod-rows" role="list">
        {notes.map((n) => {
          const who = sharedBy(n);
          const when = timeAgo(n.publishedAt ?? n.createdAt);
          return (
            <li key={n.id}>
              <Link to={libraryItemPath(n)} className="mod-row">
                <span className="mod-row__text">
                  <span className="mod-row__title">{n.title}</span>
                  <span className="mod-row__meta">{who ? `Shared by ${who}, ${when}` : `Shared ${when}`}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function NewestThreads({ moduleId, name, onTab }: { moduleId: string; name: string; onTab: (tab: string) => void }) {
  const q = useModuleLatestThreads(moduleId, { n: ROWS });
  const starts = useStartsThreads();
  const title = 'Discussion';
  if (q.isPending) return <BlockLoading title={title} />;
  if (q.isError) {
    return (
      <Block title={title} hub="module-discussion">
        <QueryError
          error={q.error}
          title={`The threads about ${name} didn’t load`}
          size="sm"
          panel={false}
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      </Block>
    );
  }
  if (!q.threads.length) return null;
  return (
    <Block
      title={title}
      hub="module-discussion"
      footer={
        <>
          <Button variant="ghost" size="sm" leadingIcon={ChatsCircle} onClick={() => onTab('discussion')}>
            {q.total > ROWS ? `All ${q.total} threads` : 'All threads'}
          </Button>
          {starts ? (
            <Button size="sm" leadingIcon={Plus} to={`/forum/new?module=${encodeURIComponent(moduleId)}`}>
              Ask a question
            </Button>
          ) : null}
        </>
      }
    >
      <ul className="mod-rows" role="list">
        {q.threads.map((t) => (
          <li key={t.id}>
            <Link to={`/forum/${t.slug}`} className="mod-row">
              <span className="mod-row__text">
                <span className="mod-row__title">{t.title}</span>
                <span className="mod-row__meta">
                  {countOf(t.replyCount, 'reply', 'replies')}
                  {t.answered ? ', answered' : ''}, {timeAgo(t.lastActivityAt)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Block>
  );
}

/** The rest of the module's shelves (books, exercises, VLE material…), and what nobody has shared yet. */
function MoreInLibrary({
  module: m,
  libraryCount,
  onTab,
  onUpload,
}: {
  module: ModuleDetail;
  libraryCount: number | null;
  onTab: (tab: string, hash?: string) => void;
  onUpload: (() => void) | null;
}) {
  const { shelves, missing } = useMemo(() => buildShelves(m), [m]);
  const name = m.unitCode || m.name;
  const rest = shelves.filter((s) => s.kind !== 'past-paper' && s.kind !== 'notes');
  if (!rest.length && !missing.length && !libraryCount) return null;
  return (
    <Block
      title={rest.length ? 'Also in the library' : 'In the library'}
      hub="module-resources"
      footer={
        <>
          {libraryCount ? (
            <Button variant="ghost" size="sm" leadingIcon={Files} onClick={() => onTab('files')}>
              All {countOf(libraryCount, 'file')}
            </Button>
          ) : null}
          {onUpload ? (
            <Button variant="ghost" size="sm" leadingIcon={UploadSimple} onClick={onUpload}>
              Upload a file
            </Button>
          ) : null}
        </>
      }
    >
      {rest.length ? (
        <ul className="mod-rows" role="list">
          {rest.map((sh) => {
            const Icon = sh.icon;
            return (
              <li key={sh.kind}>
                {sh.beingAdded ? (
                  <span className="mod-row mod-shelf" data-hub="module-shelf">
                    <Icon weight="duotone" className="mod-shelf__icon" aria-hidden="true" />
                    <span className="mod-row__text">
                      <span className="mod-row__title">{sh.label}</span>
                      <span className="mod-row__meta">On their way into the Hub. Check back soon.</span>
                    </span>
                    <Badge tone="neutral" size="sm">
                      Being added
                    </Badge>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="mod-row mod-shelf"
                    data-hub="module-shelf"
                    onClick={() => onTab('files', sh.hash)}
                  >
                    <Icon weight="duotone" className="mod-shelf__icon" aria-hidden="true" />
                    <span className="mod-row__text">
                      <span className="mod-row__title">{sh.label}</span>
                      <span className="mod-row__meta">{sh.description}</span>
                    </span>
                    <span className="mod-shelf__count u-tabular">{countOf(sh.files, 'file')}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {missing.length ? (
        <p className="mod-blk__note">
          Nobody has shared {joinAnd(missing)} for {name} yet.
        </p>
      ) : null}
    </Block>
  );
}

/** Carry on with this module: the paper being timed, and its papers, notes and lessons opened last. */
function CarryOnHere({ moduleId, extra }: { moduleId: string; extra?: ReactNode }) {
  const { any } = useCarryOn({ moduleId, n: 3 });
  if (!any) return null;
  return (
    <Block title="Carry on" hub="module-carry-on" className="mod-blk--carry" footer={extra}>
      <CarryOn moduleId={moduleId} n={3} className="mod-carry" />
    </Block>
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
  const { me, featureOn } = useAuth();
  const libraryOn = featureOn('library');
  const name = m.unitCode || m.name;
  const notesOn = !!me && !me.needsProfile && featureOn('notes');
  const notes = useModuleNotes(m.id, { limit: ROWS, enabled: notesOn });
  const startNote = useStartNote();
  const carrying = useCarryOn({ moduleId: m.id, n: 3 }).any;
  const progressShown = showsProgress(tracking, resume);
  const newNote =
    notesOn && me?.status !== 'suspended' ? (
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={Plus}
        loading={startNote.starting}
        onClick={() => startNote.start({ moduleId: m.id })}
        data-hub="module-new-note"
      >
        New note
      </Button>
    ) : null;
  const hasNotes = notesOn && (notes.isPending || notes.isError || notes.data.items.length > 0);
  // With no notes yet, "New note" goes on the lesson progress block, else on Carry on, else in a block of its own.
  const looseNote = notesOn && !hasNotes ? newNote : null;
  const noteOnProgress = progressShown ? looseNote : null;
  const noteOnCarry = !progressShown && carrying ? looseNote : null;
  const noteAlone = !progressShown && !carrying ? looseNote : null;
  return (
    <div className="mod-ov" data-hub="module-overview">
      <CarryOnHere moduleId={m.id} extra={noteOnCarry} />
      {featureOn('calendar') ? <NextDates module={m} /> : null}
      {progressShown ? (
        <YourProgress
          module={m}
          state={state}
          resume={resume}
          onOpenLesson={onOpenLesson}
          onTab={onTab}
          extra={noteOnProgress}
        />
      ) : null}
      {hasNotes ? <YourNotes moduleId={m.id} notes={notes} newNote={newNote} /> : null}
      {noteAlone ? <NoNotes name={name} newNote={noteAlone} /> : null}
      {libraryOn ? <LatestPapers moduleId={m.id} onTab={onTab} /> : null}
      {libraryOn ? <NewestNotes moduleId={m.id} onTab={onTab} /> : null}
      {moduleTabOn('discussion', featureOn) ? <NewestThreads moduleId={m.id} name={name} onTab={onTab} /> : null}
      {libraryOn ? <MoreInLibrary module={m} libraryCount={libraryCount} onTab={onTab} onUpload={onUpload} /> : null}
    </div>
  );
}
