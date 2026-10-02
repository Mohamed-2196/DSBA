// Home widget: the 1–3 modules the student is working through, most recent first, each linking
// straight to the lesson to pick up (resume the last one opened, or the next unwatched one).
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CaretRight, PlayCircle } from '@phosphor-icons/react';
import { cohortColor } from '../../state';
import { Button, EmptyState, Panel, ProgressRing, cx } from '../../ui';
import { computeRecentInProgress, useLessonProgress } from './progress.js';
import { chapterPosition, lastOpenedLabel, lessonHref } from './lessons.js';
import { MiniPoster } from './Poster.jsx';
import './ContinueLearning.css';

function ContinueRow({ item, featured }) {
  const { module: m, resume, progress, at } = item;
  const ch = m.chapters[resume.c];
  const video = ch.videos[resume.v];
  const position = chapterPosition(resume.c, video, resume.v, ch.videos.length);
  const when = lastOpenedLabel(at);
  return (
    <Link
      to={lessonHref(m.id, resume.c, resume.v)}
      className={cx('mod-cl__row', featured && 'is-featured')}
      data-module-id={m.id}
      aria-label={`${resume.kind === 'resume' ? 'Resume' : 'Continue'} ${m.unitCode || m.name}: ${ch.title}, ${position.toLowerCase()}. ${progress.pct}% of the module watched.`}
    >
      <MiniPoster module={m} c={resume.c} v={resume.v} size={featured ? 'md' : 'sm'} className="mod-cl__poster" />
      <span className="mod-cl__text">
        <span className="mod-cl__module">
          {m.unitCode ? <span className="mod-cl__code">{m.unitCode}</span> : null}
          <span className="mod-cl__short">{m.shortName}</span>
        </span>
        <span className="mod-cl__title">{ch.title}</span>
        <span className="mod-cl__meta">
          <span>{position}</span>
          {when ? <span>{resume.kind === 'resume' ? `Opened ${when}` : `Last studied ${when}`}</span> : null}
        </span>
      </span>
      <span className="mod-cl__progress" aria-hidden="true">
        <ProgressRing value={progress.pct} size={featured ? 48 : 40} stroke={4} color={cohortColor(m.year)} />
      </span>
      <CaretRight className="mod-cl__go" aria-hidden="true" />
    </Link>
  );
}

/** Card(s) for Home: last watched lesson(s) + progress. Renders an inviting empty state without history. */
export function ContinueLearning() {
  const { state } = useLessonProgress();
  const items = useMemo(() => computeRecentInProgress(state, 3), [state]);

  if (!items.length) {
    return (
      <Panel padding="none" data-hub="continue-learning">
        <EmptyState
          size="sm"
          icon={PlayCircle}
          title="Nothing in progress"
          body="Start a lesson in any module and it will wait for you here."
          action={
            <Button to="/modules" size="sm">
              Browse modules
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel padding="none" className="mod-cl" data-hub="continue-learning">
      <ol className="mod-cl__list" role="list">
        {items.map((it, i) => (
          <li key={it.module.id}>
            <ContinueRow item={it} featured={i === 0} />
          </li>
        ))}
      </ol>
    </Panel>
  );
}
