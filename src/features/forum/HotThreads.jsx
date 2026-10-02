import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowFatUp, ChatsCircle } from '@phosphor-icons/react';
import { Button, EmptyState, Panel, timeAgo } from '../../ui';
import { useYear } from '../../state';
import { hotList } from './lib/model.js';
import { ForumProvider } from './state/ForumProvider.jsx';
import { useForum } from './state/context.js';
import { ModuleTag, PlaceBadge, ReplyCount } from './components/ThreadBits.jsx';
import './components/forum.css';
import './HotThreads.css';

/** Home widget: the n hottest threads for the student's year (plus forum-wide ones). */
export function HotThreads({ n = 5 }) {
  return (
    <ForumProvider>
      <HotThreadsList n={n} />
    </ForumProvider>
  );
}

function HotThreadsList({ n }) {
  const { threads } = useForum();
  const { year } = useYear();
  const list = useMemo(() => hotList(threads, n, year), [threads, n, year]);

  if (!list.length) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={ChatsCircle}
          title="No threads yet"
          body="Questions from your cohort will show here."
          action={<Button to="/forum/new" size="sm">Start a thread</Button>}
        />
      </Panel>
    );
  }

  return (
    <Panel as="div" padding="none" className="forum-hot" data-hub="hot-threads">
      <ol role="list" className="forum-hot__list">
        {list.map((t) => (
          <li key={t.id} className="forum-hot__row" data-thread-id={t.id}>
            <span className="forum-hot__votes" aria-label={`${t.votes} votes`}>
              <ArrowFatUp weight="fill" aria-hidden="true" />
              <span className="u-tabular">{t.votes}</span>
            </span>
            <div className="forum-hot__main">
              <Link to={`/forum/${t.id}`} className="forum-hot__link" dir="auto">
                {t.title}
              </Link>
              <div className="forum-hot__meta">
                {t.module ? <ModuleTag module={t.module} /> : <PlaceBadge thread={t} />}
                <time dateTime={new Date(t.createdAt).toISOString()}>{timeAgo(t.createdAt)}</time>
              </div>
            </div>
            <ReplyCount count={t.replyCount} answered={t.answered} className="forum-hot__count" />
          </li>
        ))}
      </ol>
    </Panel>
  );
}
