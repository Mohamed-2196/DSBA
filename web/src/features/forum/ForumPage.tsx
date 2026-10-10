import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChatCircle, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import type { ThreadDetail, ThreadSummary } from '../../api/types';
import { useAuth } from '../../auth';
import { Button, Chip, EmptyState, Page, PageHeader, Panel, SearchField, SegmentedControl, TabPanel, Tabs, cx } from '../../ui';
import { useModules } from '../../state/modules';
import { flattenPages, forumKeys, useForumStats, useForumViewerSync, useThreadList, useThreadVote } from './api';
import { highlightTerms } from './lib/search';
import { useTaxonomy } from './lib/taxonomy';
import { useDebouncedValue } from './lib/useDebouncedValue';
import { useForumFilters } from './lib/useForumFilters';
import { useScrollFade } from './lib/useScrollFade';
import type { CategoryId, ThreadListParams, ThreadSort } from './types';
import { ForumSidebar } from './components/ForumSidebar';
import { LoadError, LoadMore } from './components/LoadStates';
import { ModuleTag } from './components/ThreadBits';
import { ThreadRow, ThreadRowSkeletons } from './components/ThreadRow';
import './components/forum.css';
import './ForumPage.css';

const SORTS: { value: ThreadSort; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

/** What the list page is told after "Post thread" (location state): the new thread slides in at the top. */
interface PostedState {
  posted?: { id: string; slug: string };
}

export default function ForumPage() {
  useForumViewerSync();
  const { requireAuth } = useAuth();
  const qc = useQueryClient();
  const { getModule } = useModules();
  const { categories, getCategory, getTag, tags: allTags } = useTaxonomy();
  const [filters, update, clear] = useForumFilters();
  const { cohort, tag, sort, status, module: moduleId } = filters;
  const location = useLocation();
  const posted = (location.state as PostedState | null)?.posted ?? null;
  const vote = useThreadVote();

  // The search box is local state mirrored into the URL, so typing never fights the router; the request waits
  // until typing pauses.
  const [query, setQuery] = useState(filters.q);
  useEffect(() => setQuery(filters.q), [filters.q]);
  const q = useDebouncedValue(filters.q.trim(), 300);

  const filterModule = getModule(moduleId);
  const params: ThreadListParams = {
    sort,
    q: q || undefined,
    category: cohort === 'all' ? undefined : cohort,
    tag: tag || undefined,
    moduleId: filterModule?.id,
    unanswered: status === 'no-replies' || undefined,
  };
  const list = useThreadList(params);
  const stats = useForumStats();
  // "No replies yet" counts the threads waiting in the current category.
  const waiting = cohort === 'all' ? stats.data?.noReplies : stats.data?.noRepliesByCategory?.[cohort];

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

  // Tag chips: the most used tags in the current category (plus the selected one), up to six, with their counts.
  // Before the counts arrive (or from an API without them), the tags of the threads on screen stand in, uncounted.
  const tagCounts = cohort === 'all' ? stats.data?.byTag : stats.data?.tagsByCategory?.[cohort];
  const tagChips = useMemo(() => {
    let counts: Map<string, number>;
    if (tagCounts) counts = new Map(Object.entries(tagCounts));
    else {
      counts = new Map();
      for (const t of loaded) for (const id of t.tags) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const list = allTags
      .filter((t) => (counts.get(t.id) ?? 0) > 0)
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
      .slice(0, 6)
      .map((t) => ({ ...t, count: tagCounts ? (counts.get(t.id) ?? 0) : undefined }));
    const selected = getTag(tag);
    if (selected && !list.some((t) => t.id === selected.id)) list.push({ ...selected, count: tagCounts ? (counts.get(selected.id) ?? 0) : undefined });
    return list;
  }, [tagCounts, loaded, allTags, tag, getTag]);

  const tabsRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  useScrollFade(tabsRef, '[role="tablist"]', cohort);
  useScrollFade(chipsRef, null, `${cohort}|${tagChips.map((t) => t.id).join()}`);

  const tabs = [
    { id: 'all', label: 'All', count: stats.data?.total },
    ...categories.map((c) => ({ id: c.id, label: c.label, count: stats.data ? (stats.data.byCategory[c.id] ?? 0) : undefined })),
  ];
  const pickCategory = (id: string) => update({ cohort: id, tag: '' });
  const terms = highlightTerms(q);
  const scope = cohort === 'all' ? null : (getCategory(cohort)?.label ?? null);
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
          <Button variant="primary" leadingIcon={Plus} to="/forum/new" data-hub="new-thread-button">
            Start a thread
          </Button>
        }
        meta={
          stats.data ? (
            <div className="forum-live">
              <span className="forum-live__live">
                <span className="forum-live__dot" aria-hidden="true" />
                <span className="u-tabular">{stats.data.repliesToday}</span> {stats.data.repliesToday === 1 ? 'reply' : 'replies'} today
              </span>
              {stats.data.noReplies ? (
                <button type="button" className="forum-live__link" onClick={() => update({ cohort: 'all', status: 'no-replies', tag: '', q: '' })}>
                  <span className="u-tabular">{stats.data.noReplies}</span> {stats.data.noReplies === 1 ? 'question is' : 'questions are'} waiting for a first reply
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <div className="forum-filters" data-hub="forum-filters">
        <div className="forum-filters__tabs-wrap" ref={tabsRef}>
          <Tabs idBase="forum" label="Categories" className="forum-filters__tabs" tabs={tabs} value={cohort} onChange={pickCategory} />
        </div>
        <div className="forum-filters__sort">
          <SegmentedControl label="Sort threads" size="sm" options={SORTS} value={sort} onChange={(v) => update({ sort: String(v) })} />
        </div>
        <SearchField
          className="forum-filters__search"
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            update({ q: v });
          }}
          placeholder={scope ? `Search ${scope}` : 'Search threads'}
          label="Search threads"
          dir="auto"
        />
        <div className="forum-filters__chips" role="group" aria-label="Filter threads" ref={chipsRef}>
          <Chip
            size="sm"
            icon={ChatCircle}
            selected={status === 'no-replies'}
            count={waiting}
            onChange={(on) => update({ status: on ? 'no-replies' : '' })}
            data-hub="filter-no-replies"
          >
            No replies yet
          </Chip>
          {tagChips.length ? <span className="forum-filters__sep" aria-hidden="true" /> : null}
          {tagChips.map((t) => (
            <Chip key={t.id} size="sm" selected={tag === t.id} count={t.count} onChange={(on) => update({ tag: on ? t.id : '' })}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

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
              <Button variant="ghost" size="sm" leadingIcon={X} onClick={() => clear(['cohort', 'sort'])}>
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
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : visible.length ? (
            <>
              <Panel as="div" padding="none" className={cx('forum-list-panel', searching && 'is-updating')} aria-busy={searching || undefined}>
                <ul role="list" className="forum-list">
                  {visible.map((t) => (
                    <ThreadRow key={t.id} thread={t} onVote={onVote} fresh={t.id === posted?.id} terms={terms} />
                  ))}
                </ul>
              </Panel>
              {list.hasNextPage ? (
                <LoadMore remaining={total - loaded.length} loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
              ) : null}
              {list.isError ? <LoadError error={list.error} title="Couldn't load more threads" onRetry={() => void list.refetch()} size="sm" panel={false} /> : null}
            </>
          ) : (
            <Panel as="div" padding="none" className={cx(searching && 'is-updating')}>
              {q ? (
                <EmptyState
                  icon={MagnifyingGlass}
                  title={`No threads match “${q}”`}
                  body="Try fewer words or another category, or ask it as a new thread so your cohort can answer."
                  action={
                    <>
                      <Button variant="primary" leadingIcon={Plus} to={`/forum/new?title=${encodeURIComponent(q)}`}>
                        Ask it as a thread
                      </Button>
                      <Button onClick={() => clear(['cohort', 'sort'])}>Clear filters</Button>
                    </>
                  }
                />
              ) : (
                <EmptyState
                  icon={ChatCircle}
                  title={refined ? 'No threads match these filters' : `No threads in ${scope || 'the forum'} yet`}
                  body={refined ? 'Clear a filter or two, or start the conversation yourself.' : 'Start the first one and your classmates will see it here.'}
                  action={
                    <>
                      <Button variant="primary" leadingIcon={Plus} to={cohort === 'all' ? '/forum/new' : `/forum/new?category=${cohort}`}>
                        Start a thread
                      </Button>
                      {refined ? <Button onClick={() => clear(['cohort', 'sort'])}>Clear filters</Button> : null}
                    </>
                  }
                />
              )}
            </Panel>
          )}
        </TabPanel>

        <ForumSidebar stats={stats.data} cohort={cohort} onPickCategory={(id: CategoryId | 'all') => pickCategory(id)} />
      </div>
    </Page>
  );
}
