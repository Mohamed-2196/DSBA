// Forum categories and tags. The API is the source (GET /forum/meta, which the server validates threads against);
// until it has loaded, the built-in category labels of lib/categories.ts draw the tabs.
import { useMemo } from 'react';
import type { ForumMeta } from '../../../api/types';
import { useForumMeta } from '../api';
import type { ForumCategory, ForumTag } from '../types';
import { FALLBACK_CATEGORIES, MAX_TAGS_DEFAULT } from './categories';

export { CATEGORY_IDS, categoryForYear, isCategoryId } from './categories';

export interface Taxonomy {
  categories: readonly ForumCategory[];
  tags: ForumTag[];
  maxTags: number;
  /** true once /forum/meta has loaded (tags are empty until then) */
  ready: boolean;
  getCategory: (id: string | null | undefined) => ForumCategory | null;
  getTag: (id: string | null | undefined) => ForumTag | null;
}

/** The taxonomy from GET /forum/meta, or the built-in categories (and no tags) before it has loaded. */
export function taxonomyFrom(meta: ForumMeta | undefined): Taxonomy {
  const fromApi = meta?.categories ?? [];
  const categories: readonly ForumCategory[] = fromApi.length
    ? fromApi.map((c) => ({ id: c.id, label: c.label, short: c.short, year: c.year ?? null, blurb: c.blurb }))
    : FALLBACK_CATEGORIES;
  const tags: ForumTag[] = meta?.tags ?? [];
  const catById = new Map(categories.map((c) => [c.id as string, c]));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  return {
    categories,
    tags,
    maxTags: meta?.maxTags ?? MAX_TAGS_DEFAULT,
    ready: !!meta,
    getCategory: (id) => (id ? (catById.get(id) ?? null) : null),
    getTag: (id) => (id ? (tagById.get(id) ?? null) : null),
  };
}

/** Categories and tags from the API, with built-in category labels while they load. */
export function useTaxonomy(): Taxonomy {
  const meta = useForumMeta();
  return useMemo(() => taxonomyFrom(meta.data), [meta.data]);
}
