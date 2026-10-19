import { useMemo } from 'react';
import { remainingCount } from '../../api/paging';
import type { ThreadSummary } from '../../api/types';
import { useAuth } from '../../auth';
import { Button, EmptyState, Icon, Panel, QueryError, glyph } from '../../ui';
import { useModules } from '../../state/modules';
import { flattenPages, useThreadList, useThreadVote } from './api';
import { LoadMore } from './components/LoadMore';
import { ThreadRow, ThreadRowSkeletons } from './components/ThreadRow';
import './components/forum.css';
import './HotThreads.css';

export interface ModuleThreadsProps {
  moduleId: string;
}

/** Module page "Discussion" tab: this module's threads + "Ask about this module". */
export function ModuleThreads({ moduleId }: ModuleThreadsProps) {
  const { requireAuth, mayTry } = useAuth();
  const posts = mayTry('forum.post');
  const { getModule } = useModules();
  const mod = getModule(moduleId);
  const list = useThreadList({ module_id: moduleId, sort: 'hot' }, { enabled: !!moduleId });
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
      <div aria-busy="true">
        <ThreadRowSkeletons count={3} />
        <span className="visually-hidden" role="status">
          Loading threads
        </span>
      </div>
    );
  }

  if (list.isError && !list.data) {
    return (
      <QueryError
        error={list.error}
        title={`The threads about ${name} didn’t load`}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    );
  }

  if (!threads.length) {
    return (
      <Panel padding="none">
        <EmptyState
          mate="pip-pod"
          title={`No threads about ${name} yet`}
          body="Ask the first question and your classmates will see it here and in the forum."
          action={
            posts ? (
              <Button variant="primary" leadingIcon={<Icon glyph={glyph.plus} />} to={askTo}>
                Ask about this module
              </Button>
            ) : undefined
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
        {posts ? (
          <Button variant="primary" leadingIcon={<Icon glyph={glyph.plus} />} to={askTo}>
            Ask about this module
          </Button>
        ) : null}
      </div>
      <ul role="list" className="forum-list">
        {threads.map((t) => (
          <ThreadRow key={t.id} thread={t} onVote={onVote} showModule={false} />
        ))}
      </ul>
      {list.hasNextPage ? (
        <LoadMore
          remaining={remainingCount(list.data?.pages)}
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        />
      ) : null}
      {list.isFetchNextPageError ? (
        <QueryError
          error={list.error}
          title="More threads didn’t load"
          onRetry={() => void list.fetchNextPage()}
          retrying={list.isFetchingNextPage}
          size="sm"
          panel={false}
        />
      ) : null}
    </section>
  );
}
