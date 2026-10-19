import { useMemo } from 'react';
import { ChatCircle, ChatsCircle, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import type { ThreadSummary } from '../../api/types';
import { remainingCount } from '../../api/paging';
import { useAuth } from '../../auth';
import { Button, EmptyState, Page, PageHeader, Panel, QueryError, TabPanel, cx, formatCount } from '../../ui';
import { useDebouncedValue } from '../../state';
import { useModules } from '../../state/modules';
import { flattenPages, useForumStats, useThreadList, useThreadVote } from './api';
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

export default function ForumPage() {
  const { me, requireAuth, mayTry } = useAuth();
  const posts = mayTry('forum.post');
  const { getModule } = useModules();
  const { getCategory, getTag, tags: offeredTags, ready } = useTaxonomy();
  const [filters, update, clear] = useForumFilters();
  const { tag, sort, status, module: moduleId } = filters;
  // Yours is for a signed-in person. A category the forum doesn't have (an old link) shows every thread once the
  // categories have loaded.
  const yours = filters.cohort === 'yours' && !!me;
  const cohort =
    filters.cohort === 'yours'
      ? yours
        ? 'yours'
        : 'all'
      : ready && filters.cohort !== 'all' && !getCategory(filters.cohort)
        ? 'all'
        : filters.cohort;
  const category = cohort === 'all' || cohort === 'yours' ? null : cohort;
  const vote = useThreadVote();

  // The request waits until typing pauses.
  const q = useDebouncedValue(filters.q.trim(), 300);
  const filterModule = getModule(moduleId);
  const params: ThreadListParams = {
    sort: yours ? 'new' : sort,
    q: q || undefined,
    yours: yours || undefined,
    category: category ?? undefined,
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

  // Yours: the tags of your threads on screen, uncounted (the counts are over everyone's).
  const tagCounts = yours ? undefined : category ? stats.data?.tagsByCategory?.[category] : stats.data?.byTag;
  // A retired tag still filters (a thread's link to it), so it keeps its chip while it's picked.
  const pickedTag = getTag(tag);
  const allTags = useMemo(
    () => (pickedTag?.retired ? [...offeredTags, pickedTag] : offeredTags),
    [offeredTags, pickedTag],
  );
  const chips = useMemo(
    () => tagChips({ counts: tagCounts, shownTags: loaded.map((t) => t.tags), allTags, selected: tag }),
    [tagCounts, loaded, allTags, tag],
  );

  const terms = highlightTerms(q);
  const scope = yours ? 'your threads' : category ? (getCategory(category)?.label ?? null) : null;
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
                  <span className="u-tabular">{formatCount(stats.data.repliesToday)}</span>{' '}
                  {stats.data.repliesToday === 1 ? 'reply' : 'replies'} today
                </span>
              ) : null}
              {stats.data.noReplies ? (
                <button
                  type="button"
                  className="forum-live__link"
                  onClick={() => update({ cohort: 'all', status: 'no-replies', tag: '', q: '' })}
                >
                  <span className="u-tabular">{formatCount(stats.data.noReplies)}</span>{' '}
                  {stats.data.noReplies === 1 ? 'question is' : 'questions are'} waiting for a first reply
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <ForumFilterBar
        filters={{ ...filters, cohort }}
        update={update}
        stats={stats.data}
        chips={chips}
        scope={scope}
        showYours={!!me}
      />

      <div className="forum-layout">
        <TabPanel idBase="forum" id={cohort} value={cohort} className="forum-layout__main">
          <h2 className="visually-hidden">{yours ? 'Your threads' : scope ? `${scope} threads` : 'All threads'}</h2>
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
            <QueryError
              error={list.error}
              title="The forum didn’t load"
              onRetry={() => void list.refetch()}
              retrying={list.isFetching}
            />
          ) : loaded.length ? (
            <>
              <Panel
                as="div"
                padding="none"
                className={cx('forum-list-panel', searching && 'is-updating')}
                aria-busy={searching || undefined}
              >
                <ul role="list" className="forum-list">
                  {loaded.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      onVote={onVote}
                      terms={terms}
                      time={yours ? 'activity' : 'posted'}
                    />
                  ))}
                </ul>
              </Panel>
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
            </>
          ) : (
            <Panel as="div" padding="none" className={cx(searching && 'is-updating')}>
              {yours && !refined ? (
                <NoThreadsOfYours onBrowse={() => update({ cohort: 'all' })} />
              ) : (
                <NoThreads q={q} refined={refined} scope={scope} category={category} onClear={clearFilters} />
              )}
            </Panel>
          )}
        </TabPanel>

        <ForumSidebar
          stats={stats.data}
          cohort={cohort}
          onPickCategory={(id: CategoryId | 'all') => update({ cohort: id, tag: '' })}
        />
      </div>
    </Page>
  );
}

/** Yours is empty: nothing started, replied to or followed yet. */
function NoThreadsOfYours({ onBrowse }: { onBrowse: () => void }) {
  const posts = useAuth().mayTry('forum.post');
  return (
    <EmptyState
      icon={ChatsCircle}
      title="No threads of yours yet"
      body="Threads you start, reply to or follow show up here, newest activity first."
      action={
        <>
          {posts ? (
            <Button variant="primary" leadingIcon={Plus} to="/forum/new">
              Start a thread
            </Button>
          ) : null}
          <Button onClick={onBrowse}>Browse all threads</Button>
        </>
      }
    />
  );
}

/** The list is empty: nothing matches the search, or the filters, or there is nothing in the category yet. */
function NoThreads({
  q,
  refined,
  scope,
  category,
  onClear,
}: {
  q: string;
  refined: boolean;
  scope: string | null;
  category: CategoryId | null;
  onClear: () => void;
}) {
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
      body={
        refined
          ? 'Clear a filter or two, or start the conversation yourself.'
          : 'Start the first one and your classmates will see it here.'
      }
      action={
        <>
          {posts ? (
            <Button
              variant="primary"
              leadingIcon={Plus}
              to={category ? `/forum/new?category=${category}` : '/forum/new'}
            >
              Start a thread
            </Button>
          ) : null}
          {refined ? <Button onClick={onClear}>Clear filters</Button> : null}
        </>
      }
    />
  );
}
