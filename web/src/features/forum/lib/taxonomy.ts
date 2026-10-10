// Forum categories ("where a thread lives") and tags. The API is the source (GET /forum/meta, which the server
// validates threads against); the category ids are fixed by the contract, so the page can draw its tabs with
// these built-in labels before /forum/meta has loaded.
import { useMemo } from 'react';
import { useForumMeta } from '../api';
import type { CategoryId, CohortYear, ForumCategory, ForumTag } from '../types';

export const CATEGORY_IDS: readonly CategoryId[] = ['year-1', 'year-2', 'year-3', 'study-groups', 'general'];

const FALLBACK: ForumCategory[] = [
  { id: 'year-1', label: 'Year 1', short: 'Year 1', year: 1, blurb: 'Maths, statistics, economics and business' },
  { id: 'year-2', label: 'Year 2', short: 'Year 2', year: 2, blurb: 'Distribution theory, inference, programming and more' },
  { id: 'year-3', label: 'Year 3', short: 'Year 3', year: 3, blurb: 'Machine learning, asset pricing and more' },
  { id: 'study-groups', label: 'Study groups', short: 'Study group', year: null, blurb: 'Find people to revise with' },
  { id: 'general', label: 'General', short: 'General', year: null, blurb: 'Exams, campus and everything else' },
];

export const MAX_TAGS_DEFAULT = 3;

export function isCategoryId(v: string | null | undefined): v is CategoryId {
  return !!v && (CATEGORY_IDS as readonly string[]).includes(v);
}

/** 'year-2' for 2, null otherwise. */
export function categoryForYear(year: number | null | undefined): CategoryId | null {
  return year === 1 || year === 2 || year === 3 ? `year-${year}` : null;
}

export function isCohortYear(v: unknown): v is CohortYear {
  return v === 1 || v === 2 || v === 3;
}

export interface Taxonomy {
  categories: ForumCategory[];
  tags: ForumTag[];
  maxTags: number;
  /** true once /forum/meta has loaded (tags are empty until then) */
  ready: boolean;
  getCategory: (id: string | null | undefined) => ForumCategory | null;
  getTag: (id: string | null | undefined) => ForumTag | null;
}

/** Categories and tags from the API, with built-in category labels while they load. */
export function useTaxonomy(): Taxonomy {
  const meta = useForumMeta();
  return useMemo(() => {
    const fromApi = meta.data?.categories ?? [];
    const categories: ForumCategory[] = fromApi.length
      ? fromApi.map((c) => ({ id: c.id, label: c.label, short: c.short, year: c.year ?? null, blurb: c.blurb }))
      : FALLBACK;
    const tags: ForumTag[] = meta.data?.tags ?? [];
    const catById = new Map(categories.map((c) => [c.id as string, c]));
    const tagById = new Map(tags.map((t) => [t.id, t]));
    return {
      categories,
      tags,
      maxTags: meta.data?.maxTags ?? MAX_TAGS_DEFAULT,
      ready: !!meta.data,
      getCategory: (id) => (id ? (catById.get(id) ?? null) : null),
      getTag: (id) => (id ? (tagById.get(id) ?? null) : null),
    };
  }, [meta.data]);
}
