// Forum categories and tags, and the forum's guidelines and tips: the API's (GET /forum/meta), which moderators edit
// in Manage → Forum and threads are checked against. There are none until it has loaded: the pages wait for it
// (`ready`). A retired category or tag is no longer offered, but threads that have it still show its name.
import { useMemo } from 'react';
import type { ForumMeta } from '../../../api/types';
import { useForumMeta } from '../api';
import type { ForumCategoryOut, ForumGuideline, ForumTagOut, ForumTip } from '../../../api/types';
import type { CategoryId, ForumIcon } from '../types';

export interface Taxonomy {
  /** the categories offered, in order (retired ones left out) */
  categories: readonly ForumCategoryOut[];
  /** the tags offered, in order (retired ones left out) */
  tags: readonly ForumTagOut[];
  maxTags: number;
  /** where a thread goes when no year fits it */
  defaultCategory: CategoryId | null;
  guidelines: readonly ForumGuideline[];
  tips: readonly ForumTip[];
  /** true once /forum/meta has loaded */
  ready: boolean;
  /** any category, retired ones too (a thread keeps its category) */
  getCategory: (id: string | null | undefined) => ForumCategoryOut | null;
  /** any tag, retired ones too */
  getTag: (id: string | null | undefined) => ForumTagOut | null;
  /** the first category offered for a cohort, or null */
  categoryForYear: (year: number | null | undefined) => CategoryId | null;
}

/** What a category or tag id looks like ('year-2', 'exam-prep'), for ids read from a link or a stored draft. */
export function looksLikeId(v: string | null | undefined): v is string {
  return !!v && v.length <= 32 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
}

const MAX_TAGS = 3;

/** How a thread's place shows on its row: its category's short name, in the year's colour for a year's category, or
 *  with the category's picture for a category for every year. */
export type Place = { year: number; label: string } | { year: null; label: string; icon: ForumIcon };

/** The place of a thread in `category`, or null while the categories haven't loaded. */
export function placeOf(category: ForumCategoryOut | null): Place | null {
  if (!category) return null;
  return category.year == null
    ? { year: null, label: category.short, icon: category.icon ?? 'chat' }
    : { year: category.year, label: category.short };
}

/** The taxonomy from GET /forum/meta; empty (and not ready) before it has loaded. */
export function taxonomyFrom(meta: ForumMeta | undefined): Taxonomy {
  const all = meta?.categories ?? [];
  const allTags = meta?.tags ?? [];
  const categories = all.filter((c) => !c.retired);
  const catById = new Map(all.map((c) => [c.id, c]));
  const tagById = new Map(allTags.map((t) => [t.id, t]));
  return {
    categories,
    tags: allTags.filter((t) => !t.retired),
    maxTags: meta?.maxTags ?? MAX_TAGS,
    defaultCategory: meta?.defaultCategory ?? null,
    guidelines: meta?.guidelines ?? [],
    tips: meta?.tips ?? [],
    ready: !!meta,
    getCategory: (id) => (id ? (catById.get(id) ?? null) : null),
    getTag: (id) => (id ? (tagById.get(id) ?? null) : null),
    categoryForYear: (year) => (year == null ? null : (categories.find((c) => c.year === year)?.id ?? null)),
  };
}

/** Categories, tags, guidelines and tips from the API. */
export function useTaxonomy(): Taxonomy {
  const meta = useForumMeta();
  return useMemo(() => taxonomyFrom(meta.data), [meta.data]);
}
