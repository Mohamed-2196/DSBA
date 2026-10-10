import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChatCircle, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { getModule } from '../../data/modules';
import { Button, Chip, EmptyState, Page, PageHeader, Panel, SearchField, SegmentedControl, TabPanel, Tabs } from '../../ui';
import { CATEGORIES, TAGS, getCategory, getTag } from './data/taxonomy';
import { SORTS, forumStats, highlightTerms, searchIn, sortThreads } from './lib/model';
import { useForumFilters } from './lib/useForumFilters';
import { useScrollFade } from './lib/useScrollFade';
import { ForumProvider } from './state/ForumProvider';
import { useForum } from './state/context';
import { ThreadRow } from './components/ThreadRow';
import { ModuleTag } from './components/ThreadBits';
import { ForumSidebar } from './components/ForumSidebar';
import './components/forum.css';
import './ForumPage.css';

export default function ForumPage() {
  return (
    <ForumProvider>
      <ForumList />
    </ForumProvider>
  );
}

function ForumList() {
  const { threads, toggleThreadVote } = useForum();
  const [filters, update, clear] = useForumFilters();
  const { cohort, tag, sort, status, module: moduleId } = filters;
  const location = useLocation();
  const postedId = location.state?.posted || null;

  // The search box is local state mirrored into the URL, so typing never fights the router.
  const [query, setQuery] = useState(filters.q);
  useEffect(() => setQuery(filters.q), [filters.q]);

  const stats = useMemo(() => forumStats(threads), [threads]);
  const inCohort = useMemo(() => (cohort === 'all' ? threads : threads.filter((t) => t.category === cohort)), [threads, cohort]);
  const filterModule = moduleId ? getModule(moduleId) : null;

  const visible = useMemo(() => {
    let list = inCohort;
    if (filterModule) list = list.filter((t) => t.moduleId === filterModule.id);
    if (tag) list = list.filter((t) => t.tags.includes(tag));
    if (status === 'no-replies') list = list.filter((t) => t.replyCount === 0);
    const q = filters.q.trim();
    if (q) {
      const hits = new Set(searchIn(list, q, { mode: 'all' }).map((t) => t.id));
      list = list.filter((t) => hits.has(t.id));
    }
    list = sortThreads(list, sort);
    if (sort === 'hot' && !q) list = [...list.filter((t) => t.pinned), ...list.filter((t) => !t.pinned)];
    if (postedId) {
      const i = list.findIndex((t) => t.id === postedId);
      if (i > 0) list = [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
    }
    return list;
  }, [inCohort, filterModule, tag, status, filters.q, sort, postedId]);

  // Tag chips: the most used tags in the current category (plus the selected one).
  const tagChips = useMemo(() => {
    const counts = new Map();
    for (const t of inCohort) for (const id of t.tags) counts.set(id, (counts.get(id) || 0) + 1);
    const list = TAGS.filter((t) => counts.get(t.id)).sort((a, b) => counts.get(b.id) - counts.get(a.id)).slice(0, 6);
    if (tag && !list.some((t) => t.id === tag) && getTag(tag)) list.push(getTag(tag));
    return list.map((t) => ({ ...t, count: counts.get(t.id) || 0 }));
  }, [inCohort, tag]);
  const noReplies = useMemo(() => inCohort.filter((t) => t.replyCount === 0).length, [inCohort]);

  const tabsRef = useRef(null);
  const chipsRef = useRef(null);
  useScrollFade(tabsRef, '[role="tablist"]', cohort);
  useScrollFade(chipsRef, null, `${cohort}|${tagChips.map((t) => t.id).join()}`);

  const tabs = [
    { id: 'all', label: 'All', count: stats.total },
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: stats.byCategory[c.id] || 0 })),
  ];
  const terms = highlightTerms(filters.q);
  const refined = Boolean(filters.q.trim() || tag || status || filterModule);
  const scope = cohort === 'all' ? null : getCategory(cohort)?.label;

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
          <div className="forum-live">
            <span className="forum-live__live">
              <span className="forum-live__dot" aria-hidden="true" />
              <span className="u-tabular">{stats.repliesToday}</span> replies today
            </span>
            {stats.noReplies ? (
              <button type="button" className="forum-live__link" onClick={() => update({ cohort: 'all', status: 'no-replies', tag: '', q: '' })}>
                <span className="u-tabular">{stats.noReplies}</span> {stats.noReplies === 1 ? 'question is' : 'questions are'} waiting for a first reply
              </button>
            ) : null}
          </div>
        }
      />

      <div className="forum-filters" data-hub="forum-filters">
        <div className="forum-filters__tabs-wrap" ref={tabsRef}>
          <Tabs
            idBase="forum"
            label="Categories"
            className="forum-filters__tabs"
            tabs={tabs}
            value={cohort}
            onChange={(id) => update({ cohort: id, tag: '' })}
          />
        </div>
        <div className="forum-filters__sort">
          <SegmentedControl label="Sort threads" size="sm" options={SORTS} value={sort} onChange={(v) => update({ sort: v })} />
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
            count={noReplies}
            onChange={(on) => update({ status: on ? 'no-replies' : '' })}
          >
            No replies yet
          </Chip>
          <span className="forum-filters__sep" aria-hidden="true" />
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
          {refined ? (
            <div className="forum-results" role="status">
              <span>
                <strong className="u-tabular">{visible.length}</strong> {visible.length === 1 ? 'thread' : 'threads'}
                {filterModule ? (
                  <>
                    {' '}about <ModuleTag module={filterModule} />
                  </>
                ) : null}
                {filters.q.trim() ? <> matching “{filters.q.trim()}”</> : null}
                {scope ? <> in {scope}</> : null}
              </span>
              <Button variant="ghost" size="sm" leadingIcon={X} onClick={() => clear(['cohort', 'sort'])}>
                Clear filters
              </Button>
            </div>
          ) : null}
          {visible.length ? (
            <Panel as="div" padding="none" className="forum-list-panel">
              <ul role="list" className="forum-list">
                {visible.map((t) => (
                  <ThreadRow key={t.id} thread={t} onVote={toggleThreadVote} fresh={t.id === postedId} terms={terms} />
                ))}
              </ul>
            </Panel>
          ) : (
            <Panel as="div" padding="none">
              {filters.q.trim() ? (
                <EmptyState
                  icon={MagnifyingGlass}
                  title={`No threads match “${filters.q.trim()}”`}
                  body="Try fewer words or another category, or ask it as a new thread so your cohort can answer."
                  action={
                    <>
                      <Button variant="primary" leadingIcon={Plus} to={`/forum/new?title=${encodeURIComponent(filters.q.trim())}`}>
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
                      <Button variant="primary" leadingIcon={Plus} to="/forum/new">Start a thread</Button>
                      {refined ? <Button onClick={() => clear(['cohort', 'sort'])}>Clear filters</Button> : null}
                    </>
                  }
                />
              )}
            </Panel>
          )}
        </TabPanel>

        <ForumSidebar threads={threads} counts={stats.byCategory} cohort={cohort} onPickCategory={(id) => update({ cohort: id, tag: '' })} />
      </div>
    </Page>
  );
}
