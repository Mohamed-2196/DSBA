import { useMemo } from 'react';
import { ChatsCircle, Plus } from '@phosphor-icons/react';
import type { ThreadSummary } from '../../api/types';
import { useAuth } from '../../auth';
import { Button, EmptyState, Panel } from '../../ui';
import { useModules } from '../../state/modules';
import { flattenPages, useForumViewerSync, useThreadList, useThreadVote } from './api';
import { LoadError, LoadMore } from './components/LoadStates';
import { ThreadRow, ThreadRowSkeletons } from './components/ThreadRow';
import './components/forum.css';
import './HotThreads.css';

export interface ModuleThreadsProps {
  moduleId: string;
}

/** Module page "Discussion" tab: this module's threads + "Ask about this module". */
export function ModuleThreads({ moduleId }: ModuleThreadsProps) {
  useForumViewerSync();
  const { requireAuth } = useAuth();
  const { getModule } = useModules();
  const mod = getModule(moduleId);
  const list = useThreadList({ moduleId, sort: 'hot' }, { enabled: !!moduleId });
  const vote = useThreadVote();
  const threads = useMemo(() => flattenPages(list.data), [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const name = mod ? mod.unitCode || mod.name : 'this module';
  const askTo = mod ? `/forum/new?module=${mod.id}` : '/forum/new';
  // Only count answers when every thread is on screen (otherwise the number would be wrong).
  const answered = threads.length === total ? threads.filter((t) => t.answered).length : null;

  const onVote = (t: ThreadSummary) => {
    if (!requireAuth('Sign in to vote', () => vote.mutate({ threadId: t.id, up: true }))) return;
    vote.mutate({ threadId: t.id, up: !t.voted });
  };

  if (list.isPending) {
    return (
      <Panel as="div" padding="none" aria-busy="true">
        <ThreadRowSkeletons count={3} />
        <span className="visually-hidden" role="status">
          Loading threads
        </span>
      </Panel>
    );
  }

  if (list.isError && !list.data) {
    return <LoadError error={list.error} title={`Couldn't load the threads about ${name}`} onRetry={() => void list.refetch()} />;
  }

  if (!threads.length) {
    return (
      <Panel padding="none">
        <EmptyState
          icon={ChatsCircle}
          title={`No threads about ${name} yet`}
          body="Ask the first question and your classmates will see it here and in the forum."
          action={
            <Button variant="primary" leadingIcon={Plus} to={askTo}>
              Ask about this module
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <section className="forum-modthreads" aria-labelledby="forum-modthreads-title" data-hub="module-threads">
      <div className="forum-modthreads__head">
        <div>
          <h2 id="forum-modthreads-title" className="forum-modthreads__title">
            <span className="u-tabular">{total}</span> {total === 1 ? 'thread' : 'threads'} about {name}
          </h2>
          <p className="forum-modthreads__desc">
            {answered ? `${answered} answered. ` : ''}Questions, study groups and tips from students taking it.
          </p>
        </div>
        <Button variant="primary" leadingIcon={Plus} to={askTo}>
          Ask about this module
        </Button>
      </div>
      <Panel as="div" padding="none">
        <ul role="list" className="forum-list">
          {threads.map((t) => (
            <ThreadRow key={t.id} thread={t} onVote={onVote} showModule={false} />
          ))}
        </ul>
      </Panel>
      {list.hasNextPage ? <LoadMore remaining={total - threads.length} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} /> : null}
    </section>
  );
}
