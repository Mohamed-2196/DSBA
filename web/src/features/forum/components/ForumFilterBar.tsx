import { useEffect, useRef, useState } from 'react';
import { ChatCircle } from '@phosphor-icons/react';
import type { ForumStats } from '../../../api/types';
import { Chip, SearchField, SegmentedControl, Tabs } from '../../../ui';
import type { FilterPatch } from '../lib/filters';
import type { TagChip } from '../lib/tagChips';
import { useTaxonomy } from '../lib/taxonomy';
import { useScrollFade } from '../lib/useScrollFade';
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
}

/**
 * The list's filters, all in the URL: categories (tabs), sort, search, "No replies yet" and the most used tags.
 * Wide: tabs and sort on a hairline, then search and chips. Narrow (phones): tabs, then search on its own row (it needs
 * the room), then sort and the chips, which scroll sideways.
 */
export function ForumFilterBar({ filters, update, stats, chips, scope }: ForumFilterBarProps) {
  const { categories, getCategory } = useTaxonomy();
  const { cohort, tag, sort, status } = filters;
  // A retired category is no longer a tab, unless it's the one picked (a thread's link to its category).
  const picked = cohort === 'all' ? null : getCategory(cohort);
  const shown = picked?.retired ? [...categories, picked] : categories;
  // The search box is local state mirrored into the URL, so typing never fights the router.
  const [query, setQuery] = useState(filters.q);
  useEffect(() => setQuery(filters.q), [filters.q]);
  // "No replies yet" counts the threads waiting in the current category.
  const waiting = shownCount(cohort === 'all' ? stats?.noReplies : stats?.noRepliesByCategory?.[cohort]);
  const tabs = [
    { id: 'all', label: 'All', count: shownCount(stats?.total) },
    ...shown.map((c) => ({ id: c.id, label: c.label, count: shownCount(stats?.byCategory[c.id]) })),
  ];

  const tabsRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  useScrollFade(tabsRef, '[role="tablist"]', cohort);
  useScrollFade(chipsRef, null, `${cohort}|${chips.map((t) => t.id).join()}`);

  return (
    <div className="forum-filters" data-hub="forum-filters">
      <div className="forum-filters__tabs-wrap" ref={tabsRef}>
        <Tabs idBase="forum" label="Categories" className="forum-filters__tabs" tabs={tabs} value={cohort} onChange={(id) => update({ cohort: id, tag: '' })} />
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
        <Chip size="sm" icon={ChatCircle} selected={status === 'no-replies'} count={waiting} onChange={(on) => update({ status: on ? 'no-replies' : '' })} data-hub="filter-no-replies">
          No replies yet
        </Chip>
        {chips.length ? <span className="forum-filters__sep" aria-hidden="true" /> : null}
        {chips.map((t) => (
          <Chip key={t.id} size="sm" selected={tag === t.id} count={t.count} onChange={(on) => update({ tag: on ? t.id : '' })}>
            {t.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
