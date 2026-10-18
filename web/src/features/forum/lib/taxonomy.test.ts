import { describe, expect, it } from 'vitest';
import type { ForumMeta } from '../../../api/types';
import { looksLikeId, placeOf, taxonomyFrom } from './taxonomy';

const META: ForumMeta = {
  categories: [
    { id: 'year-1', label: 'Year 1', short: 'Y1', year: 1, blurb: 'First year', retired: true },
    { id: 'year-1-maths', label: 'Year 1 maths', short: 'Maths', year: 1, blurb: 'Calculus', retired: false },
    { id: 'study-groups', label: 'Study groups', short: 'Study group', year: null, blurb: 'Revise together', icon: 'people', retired: false },
  ],
  tags: [
    { id: 'r', label: 'R', retired: false },
    { id: 'excel', label: 'Excel', retired: true },
  ],
  maxTags: 4,
  defaultCategory: 'study-groups',
  guidelines: [{ id: 'kind', icon: 'heart', text: 'Be kind.' }],
  tips: [{ id: 'one', text: 'One question.' }],
};

describe('taxonomyFrom', () => {
  it('has nothing to offer until the API has answered', () => {
    const t = taxonomyFrom(undefined);
    expect(t.ready).toBe(false);
    expect(t.categories).toEqual([]);
    expect(t.tags).toEqual([]);
    expect(t.defaultCategory).toBeNull();
    expect(t.getCategory('general')).toBeNull();
    expect(t.categoryForYear(1)).toBeNull();
  });

  it('offers the categories and tags that aren’t retired, in the API’s order', () => {
    const t = taxonomyFrom(META);
    expect(t.ready).toBe(true);
    expect(t.categories.map((c) => c.id)).toEqual(['year-1-maths', 'study-groups']);
    expect(t.tags.map((x) => x.id)).toEqual(['r']);
    expect(t.maxTags).toBe(4);
    expect(t.defaultCategory).toBe('study-groups');
    expect(t.guidelines[0]?.text).toBe('Be kind.');
    expect(t.tips[0]?.text).toBe('One question.');
  });

  it('still names a retired category or tag, for the threads that have it', () => {
    const t = taxonomyFrom(META);
    expect(t.getCategory('year-1')?.label).toBe('Year 1');
    expect(t.getTag('excel')?.label).toBe('Excel');
    expect(t.getCategory('')).toBeNull();
    expect(t.getCategory(undefined)).toBeNull();
    expect(t.getTag('python')).toBeNull();
  });

  it('puts a cohort in its first category that is offered', () => {
    const t = taxonomyFrom(META);
    expect(t.categoryForYear(1)).toBe('year-1-maths');
    expect(t.categoryForYear(2)).toBeNull();
    expect(t.categoryForYear(null)).toBeNull();
  });
});

describe('placeOf', () => {
  const t = taxonomyFrom(META);

  it('shows a year’s category by its short name, in the year’s colour', () => {
    expect(placeOf(t.getCategory('year-1-maths'))).toEqual({ year: 1, label: 'Maths' });
  });

  it('shows a category for every year with its picture, or speech bubbles without one', () => {
    expect(placeOf(t.getCategory('study-groups'))).toEqual({ year: null, label: 'Study group', icon: 'people' });
    expect(placeOf({ id: 'campus', label: 'Campus', short: 'Campus', year: null, blurb: 'Life on campus', retired: false })).toEqual({ year: null, label: 'Campus', icon: 'chat' });
  });

  it('shows nothing while the categories load', () => {
    expect(placeOf(taxonomyFrom(undefined).getCategory('year-1'))).toBeNull();
  });
});

describe('looksLikeId', () => {
  it('takes what an id looks like from a link, and nothing else', () => {
    expect(looksLikeId('year-2')).toBe(true);
    expect(looksLikeId('r')).toBe(true);
    expect(looksLikeId('Year 2')).toBe(false);
    expect(looksLikeId('-year')).toBe(false);
    expect(looksLikeId('')).toBe(false);
    expect(looksLikeId(null)).toBe(false);
    expect(looksLikeId('a'.repeat(33))).toBe(false);
  });
});
