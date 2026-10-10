// Home widget: the 1–3 modules the student is working through, most recent first, each linking straight to the
// lesson to pick up (resume the last one opened, or the next unwatched one).
import { CaretRight, PlayCircle } from '@phosphor-icons/react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ModuleDetail } from '../../api/types';
import { cohortColor } from '../../state';
import { useModules } from '../../state/modules';
import { Button, EmptyState, Panel, ProgressRing, Skeleton, cx } from '../../ui';
import { moduleDetailQuery } from './api';
import { chapterPosition, lastOpenedLabel, lessonHref } from './lessons';
import { ImportProgressPrompt } from './ImportProgressPrompt';
import { MiniPoster } from './Poster';
import { computeModuleProgress, computeResumePoint, useProgress, type Fraction, type ResumePoint } from './progress';
import './ContinueLearning.css';

interface Item {
  module: ModuleDetail;
  at: number;
  resume: ResumePoint;
  progress: Fraction;
}

function ContinueRow({ item, featured }: { item: Item; featured: boolean }) {
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

/** One stable value for all the module queries (re-made only when one of them changes). */
function combineDetails(results: UseQueryResult<ModuleDetail>[]) {
  return { data: results.map((r) => r.data), pending: results.some((r) => r.isPending) };
}

function Loading() {
  return (
    <Panel padding="none" className="mod-cl" data-hub="continue-learning" aria-busy="true">
      <div className="mod-cl__loading" aria-hidden="true">
        <Skeleton width={120} height={68} radius={10} />
        <Skeleton lines={3} />
      </div>
    </Panel>
  );
}

/** Card(s) for Home: the last lesson(s) opened, with module progress. An inviting empty state without history. */
export function ContinueLearning() {
  const { state, ready } = useProgress();
  const { getModule } = useModules();

  // The most recently opened modules that still exist in the catalogue (a few extra: some may be finished).
  const recent = useMemo(
    () =>
      Object.entries(state.last)
        .filter(([id, l]) => l.at > 0 && getModule(id))
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, 5),
    [state.last, getModule],
  );
  const details = useQueries({ queries: recent.map(([id]) => moduleDetailQuery(id)), combine: combineDetails });

  const items = useMemo(() => {
    const out: Item[] = [];
    recent.forEach(([, last], i) => {
      const m = details.data[i];
      if (!m) return;
      const resume = computeResumePoint(state, m);
      if (!resume || resume.kind === 'done') return;
      out.push({ module: m, at: last.at, resume, progress: computeModuleProgress(state, m) });
    });
    return out.slice(0, 3);
  }, [recent, state, details.data]);

  let body: ReactNode;
  if (!ready || (recent.length > 0 && details.pending && !items.length)) body = <Loading />;
  else if (!items.length) {
    body = (
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
  } else {
    body = (
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

  return (
    <>
      {body}
      <ImportProgressPrompt />
    </>
  );
}
