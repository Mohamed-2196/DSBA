import { describe, expect, it } from 'vitest';
import type { ForumMeta } from '../../../api/types';
import { CATEGORY_IDS, FALLBACK_CATEGORIES, MAX_TAGS_DEFAULT, categoryForYear, isCategoryId } from './categories';
import { taxonomyFrom } from './taxonomy';

const META: ForumMeta = {
  categories: [
    { id: 'year-1', label: 'Year 1', short: 'Y1', year: 1, blurb: 'First year' },
    { id: 'study-groups', label: 'Study groups', short: 'Study group', year: null, blurb: 'Revise together' },
  ],
  tags: [
    { id: 'r', label: 'R' },
    { id: 'exam-prep', label: 'Exam prep' },
  ],
  maxTags: 4,
};

describe('categories', () => {
  it('knows the five category ids of the contract, and nothing else', () => {
    expect(CATEGORY_IDS).toEqual(['year-1', 'year-2', 'year-3', 'study-groups', 'general']);
    expect(isCategoryId('year-2')).toBe(true);
    expect(isCategoryId('year-4')).toBe(false);
    expect(isCategoryId('')).toBe(false);
    expect(isCategoryId(null)).toBe(false);
  });

  it('puts a cohort in its year’s category', () => {
    expect(categoryForYear(1)).toBe('year-1');
    expect(categoryForYear(3)).toBe('year-3');
    expect(categoryForYear(4)).toBeNull();
    expect(categoryForYear(null)).toBeNull();
  });

  it('has a built-in label for every category, to draw the tabs before the API answers', () => {
    expect(FALLBACK_CATEGORIES.map((c) => c.id)).toEqual(CATEGORY_IDS);
  });
});

describe('taxonomyFrom', () => {
  it('draws the built-in categories, without tags, until the API has answered', () => {
    const t = taxonomyFrom(undefined);
    expect(t.ready).toBe(false);
    expect(t.categories).toBe(FALLBACK_CATEGORIES);
    expect(t.tags).toEqual([]);
    expect(t.maxTags).toBe(MAX_TAGS_DEFAULT);
    expect(t.getCategory('general')?.label).toBe('General');
  });

  it('takes the API’s categories, tags and limit once it has', () => {
    const t = taxonomyFrom(META);
    expect(t.ready).toBe(true);
    expect(t.categories.map((c) => c.id)).toEqual(['year-1', 'study-groups']);
    expect(t.getCategory('study-groups')).toEqual({ id: 'study-groups', label: 'Study groups', short: 'Study group', year: null, blurb: 'Revise together' });
    expect(t.getCategory('general')).toBeNull();
    expect(t.getTag('exam-prep')?.label).toBe('Exam prep');
    expect(t.maxTags).toBe(4);
  });

  it('finds nothing for an empty or unknown id', () => {
    const t = taxonomyFrom(META);
    expect(t.getCategory('')).toBeNull();
    expect(t.getCategory(undefined)).toBeNull();
    expect(t.getTag('python')).toBeNull();
    expect(t.getTag(null)).toBeNull();
  });
});
