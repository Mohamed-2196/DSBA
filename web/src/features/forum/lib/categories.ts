// Forum categories ("where a thread lives"): ids fixed by the contract, and built-in labels to draw the tabs with
// before GET /forum/meta has loaded (lib/taxonomy.ts then takes the API's).
import type { CategoryId, ForumCategory } from '../types';

export const CATEGORY_IDS: readonly CategoryId[] = ['year-1', 'year-2', 'year-3', 'study-groups', 'general'];

export const FALLBACK_CATEGORIES: readonly ForumCategory[] = [
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
