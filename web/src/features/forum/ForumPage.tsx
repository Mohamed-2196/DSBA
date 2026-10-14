import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChatCircle, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import type { ThreadDetail, ThreadSummary } from '../../api/types';
import { remainingCount } from '../../api/paging';
import { useAuth } from '../../auth';
import { Button, EmptyState, Page, PageHeader, Panel, QueryError, TabPanel, cx, formatCount } from '../../ui';
import { useDebouncedValue } from '../../state';
import { useModules } from '../../state/modules';
import { flattenPages, forumKeys, useForumStats, useThreadList, useThreadVote } from './api';
import { highlightTerms } from './lib/search';
import { tagChips } from './lib/tagChips';
import { useTaxonomy } from './lib/taxonomy';
import { useForumFilters } from './lib/useForumFilters';
import type { CategoryId, ThreadListParams } from './types';
import { ForumFilterBar } from './components/ForumFilterBar';
import { ForumSidebar } from './components/ForumSidebar';
import { LoadMore } from './components/LoadMore';
import { ModuleTag } from './components/ThreadBits';
import { ThreadRow, ThreadRowSkeletons } from './components/ThreadRow';
import './components/forum.css';
import './ForumPage.css';

/** What the list page is told after "Post thread" (location state): the new thread slides in at the top. */
interface PostedState {
  posted?: { id: string; slug: string };
}

export default function ForumPage() {
  const { requireAuth, mayTry } = useAuth();
  const posts = mayTry('forum.post');
  const qc = useQueryClient();
  const { getModule } = useModules();
  const { getCategory, tags: allTags } = useTaxonomy();
  const [filters, update, clear] = useForumFilters();
  const { cohort, tag, sort, status, module: moduleId } = filters;
  const location = useLocation();
  const posted = (location.state as PostedState | null)?.posted ?? null;
  const vote = useThreadVote();

  // The request waits until typing pauses.
  const q = useDebouncedValue(filters.q.trim(), 300);
  const filterModule = getModule(moduleId);
  const params: ThreadListParams = {
    sort,
    q: q || undefined,
    category: cohort === 'all' ? undefined : cohort,
    tag: tag || undefined,
    module_id: filterModule?.id,
    unanswered: status === 'no-replies' || undefined,
  };
  const list = useThreadList(params);
  const stats = useForumStats();

  const loaded = useMemo(() => flattenPages(list.data), [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;
  const refined = Boolean(q || tag || status || filterModule);
  const searching = filters.q.trim() !== q || (list.isFetching && list.isPlaceholderData);

  // The thread you just posted goes first (sliding in), even when the sort would put it lower.
  const visible = useMemo(() => {
    if (!posted) return loaded;
    const i = loaded.findIndex((t) => t.id === posted.id);
    if (i > 0) return [loaded[i], ...loaded.slice(0, i), ...loaded.slice(i + 1)];
    if (i === 0 || refined) return loaded;
    // Not on the first page yet (a slow list, another sort): the thread the API returned stands in.
    const created: ThreadSummary | undefined = qc.getQueryData<ThreadDetail>(forumKeys.thread(posted.slug));
    return created && (cohort === 'all' || created.category === cohort) ? [created, ...loaded] : loaded;
  }, [loaded, posted, refined, qc, cohort]);

  const tagCounts = cohort === 'all' ? stats.data?.byTag : stats.data?.tagsByCategory?.[cohort];
  const chips = useMemo(() => tagChips({ counts: tagCounts, shownTags: loaded.map((t) => t.tags), allTags, selected: tag }), [tagCounts, loaded, allTags, tag]);

  const terms = highlightTerms(q);
  const scope = cohort === 'all' ? null : (getCategory(cohort)?.label ?? null);
  const clearFilters = () => clear(['cohort', 'sort']);
  const onVote = (t: ThreadSummary) => {
    if (!requireAuth('Sign in to vote', () => vote.mutate({ threadId: t.id, up: true }))) return;
    vote.mutate({ threadId: t.id, up: !t.voted });
  };

  return (
    <Page className="forum-page">
      <PageHeader
        title="Forum"
        description="Ask your cohort, share what worked and find people to revise with."
        actions={
          posts ? (
            <Button variant="primary" leadingIcon={Plus} to="/forum/new" data-hub="new-thread-button">
              Start a thread
            </Button>
          ) : undefined
        }
        meta={
          stats.data && (stats.data.repliesToday || stats.data.noReplies) ? (
            <div className="forum-live">
              {stats.data.repliesToday ? (
                <span className="forum-live__live">
                  <span className="forum-live__dot" aria-hidden="true" />
                  <span className="u-tabular">{formatCount(stats.data.repliesToday)}</span> {stats.data.repliesToday === 1 ? 'reply' : 'replies'} today
                </span>
              ) : null}
              {stats.data.noReplies ? (
                <button type="button" className="forum-live__link" onClick={() => update({ cohort: 'all', status: 'no-replies', tag: '', q: '' })}>
                  <span className="u-tabular">{formatCount(stats.data.noReplies)}</span> {stats.data.noReplies === 1 ? 'question is' : 'questions are'} waiting for a first reply
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <ForumFilterBar filters={filters} update={update} stats={stats.data} chips={chips} scope={scope} />

      <div className="forum-layout">
        <TabPanel idBase="forum" id={cohort} value={cohort} className="forum-layout__main">
          <h2 className="visually-hidden">{scope ? `${scope} threads` : 'All threads'}</h2>
          {refined && list.data ? (
            <div className="forum-results" role="status">
              <span>
                <strong className="u-tabular">{total}</strong> {total === 1 ? 'thread' : 'threads'}
                {filterModule ? (
                  <>
                    {' '}
                    about <ModuleTag module={filterModule} />
                  </>
                ) : null}
                {q ? <> matching “{q}”</> : null}
                {scope ? <> in {scope}</> : null}
              </span>
              <Button variant="ghost" size="sm" leadingIcon={X} onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}

          {list.isPending ? (
            <Panel as="div" padding="none" className="forum-list-panel" aria-busy="true">
              <ThreadRowSkeletons count={6} />
              <span className="visually-hidden" role="status">
                Loading threads
              </span>
            </Panel>
          ) : list.isError && !list.data ? (
            <QueryError error={list.error} title="The forum didn’t load" onRetry={() => void list.refetch()} retrying={list.isFetching} />
          ) : visible.length ? (
            <>
              <Panel as="div" padding="none" className={cx('forum-list-panel', searching && 'is-updating')} aria-busy={searching || undefined}>
                <ul role="list" className="forum-list">
                  {visible.map((t) => (
                    <ThreadRow key={t.id} thread={t} onVote={onVote} fresh={t.id === posted?.id} terms={terms} />
                  ))}
                </ul>
              </Panel>
              {list.hasNextPage ? <LoadMore remaining={remainingCount(list.data?.pages)} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} /> : null}
              {list.isFetchNextPageError ? (
                <QueryError error={list.error} title="More threads didn’t load" onRetry={() => void list.fetchNextPage()} retrying={list.isFetchingNextPage} size="sm" panel={false} />
              ) : null}
            </>
          ) : (
            <Panel as="div" padding="none" className={cx(searching && 'is-updating')}>
              <NoThreads q={q} refined={refined} scope={scope} cohort={cohort} onClear={clearFilters} />
            </Panel>
          )}
        </TabPanel>

        <ForumSidebar stats={stats.data} cohort={cohort} onPickCategory={(id: CategoryId | 'all') => update({ cohort: id, tag: '' })} />
      </div>
    </Page>
  );
}

/** The list is empty: nothing matches the search, or the filters, or there is nothing in the category yet. */
function NoThreads({ q, refined, scope, cohort, onClear }: { q: string; refined: boolean; scope: string | null; cohort: CategoryId | 'all'; onClear: () => void }) {
  const posts = useAuth().mayTry('forum.post');
  if (q) {
    return (
      <EmptyState
        icon={MagnifyingGlass}
        illustration="search"
        title={`No threads match “${q}”`}
        body="Try fewer words or another category, or ask it as a new thread so your cohort can answer."
        action={
          <>
            {posts ? (
              <Button variant="primary" leadingIcon={Plus} to={`/forum/new?title=${encodeURIComponent(q)}`}>
                Ask it as a thread
              </Button>
            ) : null}
            <Button onClick={onClear}>Clear filters</Button>
          </>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={ChatCircle}
      title={refined ? 'No threads match these filters' : `No threads in ${scope || 'the forum'} yet`}
      body={refined ? 'Clear a filter or two, or start the conversation yourself.' : 'Start the first one and your classmates will see it here.'}
      action={
        <>
          {posts ? (
            <Button variant="primary" leadingIcon={Plus} to={cohort === 'all' ? '/forum/new' : `/forum/new?category=${cohort}`}>
              Start a thread
            </Button>
          ) : null}
          {refined ? <Button onClick={onClear}>Clear filters</Button> : null}
        </>
      }
    />
  );
}
