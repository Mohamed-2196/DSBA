import { Link } from 'react-router-dom';
import { ArrowFatUp, ChatsCircle } from '@phosphor-icons/react';
import { Button, EmptyState, Panel, Skeleton, timeAgo } from '../../ui';
import { useYear } from '../../state';
import { useModules } from '../../state/modules';
import { useForumViewerSync, useHotThreads } from './api';
import { isCohortYear } from './lib/taxonomy';
import { LoadError } from './components/LoadStates';
import { ModuleTag, PlaceBadge, ReplyCount } from './components/ThreadBits';
import './components/forum.css';
import './HotThreads.css';

export interface HotThreadsProps {
  /** how many threads (default 5) */
  n?: number;
}

/** Home widget: the n hottest threads for the student's year (plus forum-wide ones). */
export function HotThreads({ n = 5 }: HotThreadsProps) {
  useForumViewerSync();
  const { year } = useYear();
  const { getModule } = useModules();
  const hot = useHotThreads({ n, year: isCohortYear(year) ? year : null });

  if (hot.isPending) {
    return (
      <Panel as="div" padding="none" className="forum-hot" aria-busy="true">
        <ol role="list" className="forum-hot__list" aria-hidden="true">
          {Array.from({ length: Math.min(n, 5) }, (_, i) => (
            <li key={i} className="forum-hot__row">
              <Skeleton width={28} height={34} />
              <div className="forum-hot__main">
                <Skeleton width={i % 2 ? '82%' : '64%'} height="1em" />
                <Skeleton width="38%" height="0.8em" style={{ marginTop: 8 }} />
              </div>
              <Skeleton width={40} height={24} radius="var(--r-pill)" />
            </li>
          ))}
        </ol>
        <span className="visually-hidden" role="status">
          Loading threads
        </span>
      </Panel>
    );
  }

  if (hot.isError) return <LoadError size="sm" title="Couldn't load the forum" error={hot.error} onRetry={() => void hot.refetch()} />;

  if (!hot.data.length) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={ChatsCircle}
          title="No threads yet"
          body="Questions from your cohort will show here."
          action={
            <Button to="/forum/new" size="sm">
              Start a thread
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel as="div" padding="none" className="forum-hot" data-hub="hot-threads">
      <ol role="list" className="forum-hot__list">
        {hot.data.map((t) => (
          <li key={t.id} className="forum-hot__row" data-thread-id={t.id}>
            <span className="forum-hot__votes" aria-label={`${t.voteCount} ${t.voteCount === 1 ? 'vote' : 'votes'}`}>
              <ArrowFatUp weight="fill" aria-hidden="true" />
              <span className="u-tabular">{t.voteCount}</span>
            </span>
            <div className="forum-hot__main">
              <Link to={`/forum/${t.slug}`} className="forum-hot__link" dir="auto">
                {t.title}
              </Link>
              <div className="forum-hot__meta">
                {t.moduleId && getModule(t.moduleId) ? <ModuleTag module={getModule(t.moduleId)} /> : <PlaceBadge thread={t} />}
                <time dateTime={t.createdAt}>{timeAgo(t.createdAt)}</time>
              </div>
            </div>
            <ReplyCount count={t.replyCount} answered={t.answered} className="forum-hot__count" />
          </li>
        ))}
      </ol>
    </Panel>
  );
}
