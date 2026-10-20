import { useEffect, useRef, useState } from 'react';
import type { ForumStats } from '../../../api/types';
import { BREAKPOINTS, useMediaQuery } from '../../../state';
import { Button, Chip, Drawer, Icon, SearchField, SegmentedControl, Tabs, glyph, useScrollFade } from '../../../ui';
import type { FilterPatch } from '../lib/filters';
import type { TagChip } from '../lib/tagChips';
import { useTaxonomy } from '../lib/taxonomy';
import type { ForumFilters, ThreadSort } from '../types';

const SORTS: { value: ThreadSort; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

/** A count worth showing: a new Hub has many zeros, and "0" next to everything says nothing (UX review UX-17). */
const shownCount = (n: number | null | undefined) => (n ? n : undefined);

export interface ForumFilterBarProps {
  filters: ForumFilters;
  update: (patch: FilterPatch) => void;
  stats: ForumStats | undefined;
  /** lib/tagChips.ts */
  chips: TagChip[];
  /** the category's name when one is picked ("Search Year 2") */
  scope: string | null;
  /** the Yours tab (signed in): threads you started, replied to or follow */
  showYours: boolean;
}

/**
 * The list's filters, all in the URL: categories (tabs), sort, search, "No replies yet" and the most used tags.
 * Signed in, Yours follows All: newest activity first, so it has no sort. Its parts are items of the page's grid
 * (ForumPage.css): wide, the tabs head the list with the search beside them over the sidebar, and the chips and the
 * sort sit under the tabs; narrow (phones), tabs, then search on its own row, then the chips, which scroll sideways.
 */
export function ForumFilterBar({ filters, update, stats, chips, scope, showYours }: ForumFilterBarProps) {
  const { categories, getCategory } = useTaxonomy();
  const { cohort, tag, sort, status } = filters;
  // A retired category is no longer a tab, unless it's the one picked (a thread's link to its category).
  const picked = cohort === 'all' || cohort === 'yours' ? null : getCategory(cohort);
  const shown = picked?.retired ? [...categories, picked] : categories;
  // The search box is local state mirrored into the URL, so typing never fights the router.
  const [query, setQuery] = useState(filters.q);
  useEffect(() => setQuery(filters.q), [filters.q]);
  // "No replies yet" counts the threads waiting in the current category.
  // (Yours has no count: the stats are over everyone's threads.)
  const waiting =
    cohort === 'yours' ? undefined : shownCount(picked ? stats?.noRepliesByCategory?.[picked.id] : stats?.noReplies);
  const tabs = [
    { id: 'all', label: 'All', count: shownCount(stats?.total) },
    ...(showYours ? [{ id: 'yours', label: 'Yours' }] : []),
    ...shown.map((c) => ({ id: c.id, label: c.label, count: shownCount(stats?.byCategory[c.id]) })),
  ];

  const chipsRef = useRef<HTMLDivElement>(null);
  useScrollFade(chipsRef, null, `${cohort}|${chips.map((t) => t.id).join()}`);
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const [sheetOpen, setSheetOpen] = useState(false);
  const yours = cohort === 'yours';
  const on = (status === 'no-replies' ? 1 : 0) + (tag ? 1 : 0) + (!yours && sort !== 'hot' ? 1 : 0);

  const noReplies = (
    <Chip
      size="sm"
      icon={<Icon glyph={glyph.forum} />}
      selected={status === 'no-replies'}
      count={waiting}
      onChange={(picked) => update({ status: picked ? 'no-replies' : '' })}
      data-hub="filter-no-replies"
    >
      No replies yet
    </Chip>
  );
  const tagChips = chips.map((t) => (
    <Chip
      key={t.id}
      size="sm"
      selected={tag === t.id}
      count={t.count}
      onChange={(picked) => update({ tag: picked ? t.id : '' })}
    >
      {t.label}
    </Chip>
  ));
  const sortControl = yours ? (
    <span className="forum-filters__order">Newest activity first</span>
  ) : (
    <SegmentedControl
      label="Sort threads"
      size="sm"
      options={SORTS}
      value={sort}
      onChange={(v) => update({ sort: String(v) })}
    />
  );
  const searchField = (
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
  );
  const tabsEl = (
    <div className="forum-filters__tabs-wrap">
      <Tabs
        idBase="forum"
        label="Categories"
        className="forum-filters__tabs u-scroll-row--bleed"
        tabs={tabs}
        value={cohort}
        onChange={(id) => update({ cohort: id, tag: '' })}
      />
    </div>
  );

  if (phone)
    return (
      <div className="forum-filters" data-hub="forum-filters">
        {tabsEl}
        <div className="forum-filters__phone">
          {searchField}
          <button
            type="button"
            className="forum-filters__open"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-label={on ? `Filters, ${on} on` : 'Filters'}
            data-hub="forum-filters-open"
          >
            <Icon glyph={glyph.filter} />
            Filters
            {on ? <span className="forum-filters__n">{on}</span> : null}
          </button>
        </div>
        <Drawer
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          side="bottom"
          title="Filters"
          bodyClassName="forum-sheet"
          footer={
            <>
              <Button variant="ghost" onClick={() => update({ status: '', tag: '', sort: 'hot' })} disabled={!on}>
                Clear all
              </Button>
              <Button variant="primary" onClick={() => setSheetOpen(false)} data-hub="forum-filters-done">
                Show threads
              </Button>
            </>
          }
        >
          <div className="forum-sheet__group">
            <h3 className="forum-sheet__label">Sort</h3>
            {sortControl}
          </div>
          <div className="forum-sheet__group">
            <h3 className="forum-sheet__label">Show</h3>
            <div className="forum-sheet__chips" role="group" aria-label="Filter threads">
              {noReplies}
              {tagChips}
            </div>
          </div>
        </Drawer>
      </div>
    );

  return (
    <div className="forum-filters" data-hub="forum-filters">
      {tabsEl}
      {searchField}
      <div className="forum-filters__row">
        <div
          className="forum-filters__chips u-scroll-row u-scroll-row--bleed"
          role="group"
          aria-label="Filter threads"
          ref={chipsRef}
        >
          {noReplies}
          {chips.length ? <span className="forum-filters__sep" aria-hidden="true" /> : null}
          {tagChips}
        </div>
        <div className="forum-filters__sort">{sortControl}</div>
      </div>
    </div>
  );
}
