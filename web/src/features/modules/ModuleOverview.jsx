// Overview tab: every v1 resource as a labelled entry (each opens its original link in a new tab and
// points to the in-app Files tab), plus progress, "Pick up where you left off" and the next exam.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut, CalendarBlank, CheckCircle, FileText, Files, PlusCircle } from '@phosphor-icons/react';
import { lessonKey } from '../../data/modules';
import { CONTRIBUTE_URL } from '../../data/people';
import { cohortColor } from '../../state';
import { Avatar, Button, Panel, SectionHeader, cx } from '../../ui';
import { computeChapterProgress } from './progress';
import { buildResources, joinAnd } from './resources';
import { chapterPosition, lastOpenedLabel, lessonSearch } from './lessons';
import { MiniPoster } from './Poster';

const PICKUP_TITLE = { resume: 'Pick up where you left off', next: 'Up next', start: 'Start the lessons', done: 'All lessons watched' };
const PICKUP_ACTION = { resume: 'Resume lesson', next: 'Continue', start: 'Start lesson 1', done: 'Watch again' };
const MAX_CHAPTERS = 6;

/** How many library files came from a given original link (library File.sourceUrl). */
function countFrom(files, ...urls) {
  const set = new Set(urls.filter(Boolean));
  return set.size ? files.filter((f) => f && set.has(f.sourceUrl)).length : 0;
}

function InAppLink({ count, onTab }) {
  return (
    <button type="button" className="mod-res__inapp" onClick={() => onTab('files')}>
      <Files aria-hidden="true" />
      {count ? `${count} ${count === 1 ? 'file' : 'files'} in the app` : 'Find in Files'}
    </button>
  );
}

function ResourceEntry({ entry, inApp, onTab }) {
  const Icon = entry.icon;
  return (
    <div className={cx('mod-res__entry', `mod-res__entry--${entry.id}`)}>
      <dt className="mod-res__label">
        <Icon weight="duotone" className="mod-res__icon" aria-hidden="true" />
        <span>{entry.label}</span>
      </dt>
      <dd className="mod-res__body">
        {entry.notes ? (
          // Notes have one link per note, so the in-app pointer sits on the description line.
          <div className="mod-res__lead">
            <p className="mod-res__desc">{entry.description}</p>
            <InAppLink count={inApp} onTab={onTab} />
          </div>
        ) : entry.description ? (
          <p className="mod-res__desc">{entry.description}</p>
        ) : null}
        {entry.note ? (
          <blockquote className="mod-res__note">
            <p>{entry.note}</p>
          </blockquote>
        ) : null}
        {entry.notes ? (
          <ul className="mod-res__notes" role="list">
            {entry.notes.map((n) => (
              <li key={`${n.name}-${n.url}`} className="mod-note">
                {n.author ? (
                  <Avatar name={n.author} size="md" decorative />
                ) : (
                  <span className="mod-note__doc" aria-hidden="true">
                    <FileText weight="duotone" />
                  </span>
                )}
                <span className="mod-note__text">
                  <span className="mod-note__title">{n.title}</span>
                  <span className="mod-note__by">{n.byline}</span>
                </span>
                <Button size="sm" href={n.url} trailingIcon={ArrowSquareOut} aria-label={`Open ${n.title} (opens in a new tab)`}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {entry.notes ? null : (
          <div className="mod-res__actions">
            {entry.links.map((l) => (
              <Button key={l.href + l.label} size="sm" href={l.href} trailingIcon={ArrowSquareOut} aria-label={l.ariaLabel}>
                {l.label}
              </Button>
            ))}
            <InAppLink count={inApp} onTab={onTab} />
          </div>
        )}
      </dd>
    </div>
  );
}

function PickUp({ module: m, resume }) {
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
          <span className="mod-pick__pos">
            {chapterPosition(resume.c, video, resume.v, ch.videos.length)}
          </span>
          <span className="mod-pick__title">{ch.title}</span>
          {whenText ? <span className="mod-pick__when">{whenText}</span> : null}
        </span>
      </Link>
    </section>
  );
}

function ProgressSection({ module: m, state, onOpenLesson, onTab }) {
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

function ExamSection({ exam, inSession }) {
  const rel = exam.relative.charAt(0).toUpperCase() + exam.relative.slice(1);
  return (
    <section className="mod-side__section mod-examcard" aria-labelledby="mod-exam-title">
      <h2 id="mod-exam-title" className="mod-side__title">
        Next exam
      </h2>
      <p className="mod-examcard__date">
        <span className="mod-examcard__dot" aria-hidden="true" />
        {exam.weekday} {exam.date}
      </p>
      <p className={cx('mod-examcard__rel', exam.soon && 'is-soon')}>
        {rel}
        {inSession ? ', in the October exam session' : ''}.
      </p>
      <Button variant="ghost" size="sm" to="/calendar" leadingIcon={CalendarBlank} className="mod-examcard__cal">
        Open calendar
      </Button>
    </section>
  );
}

export function ModuleOverview({ module: m, state, resume, exam, files, onOpenLesson, onTab }) {
  const { entries, missing } = useMemo(() => buildResources(m), [m]);
  const r = m.resources;
  const inAppFor = (id) => {
    if (id === 'materials') return countFrom(files, r.materials);
    if (id === 'exercises') return countFrom(files, r.exercises);
    if (id === 'exams') return countFrom(files, r.vle, r.olderExams);
    if (id === 'cheatSheet') return countFrom(files, r.cheatSheet);
    if (id === 'notes') return countFrom(files, ...m.notes.map((n) => n.url));
    return 0;
  };
  const examInSession = exam && /october/i.test(exam.event.title);

  return (
    <div className="mod-ov">
      <section className="mod-ov__main" aria-labelledby="mod-res-title">
        <SectionHeader
          id="mod-res-title"
          title="Resources"
          description="Everything from the module's shared folders. Each link opens the original in a new tab."
          action={
            <Button variant="ghost" size="sm" leadingIcon={Files} onClick={() => onTab('files')}>
              {files.length ? `Read ${files.length} files in the app` : 'Read files in the app'}
            </Button>
          }
        />
        <Panel as="div" padding="none" className="mod-res" data-hub="module-resources">
          <dl className="mod-res__list">
            {entries.map((e) => (
              <ResourceEntry key={e.id} entry={e} inApp={inAppFor(e.id)} onTab={onTab} />
            ))}
          </dl>
          {missing.length ? (
            <div className="mod-res__missing">
              <p>
                <span className="mod-res__missing-label">Not shared yet:</span> {joinAnd(missing)}.
              </p>
              <Button size="sm" variant="ghost" href={CONTRIBUTE_URL} leadingIcon={PlusCircle} aria-label="Share a resource on GitHub (opens in a new tab)">
                Share a resource
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
              <p className="mod-side__text">Suggest videos for {m.unitCode || m.name} and they can be added as lessons here.</p>
              <Button size="sm" href={CONTRIBUTE_URL} trailingIcon={ArrowSquareOut} aria-label="Suggest a playlist on GitHub (opens in a new tab)">
                Suggest a playlist
              </Button>
            </section>
          )}
          {resume ? <ProgressSection module={m} state={state} onOpenLesson={onOpenLesson} onTab={onTab} /> : null}
          {exam ? <ExamSection exam={exam} inSession={examInSession} /> : null}
        </Panel>
      </aside>
    </div>
  );
}
