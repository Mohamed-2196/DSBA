import { describe, expect, it } from 'vitest';
import { composerPresets, type PresetLookups } from './composerPresets';
import { BODY_MAX, TITLE_MAX } from './threadForm';

const MODULES = [
  { id: 'mathematics', unitCode: 'MT1186', year: 1 as const },
  { id: 'advanced-stats-distribution', unitCode: 'ST2133', year: 2 as const },
  { id: 'machine-learning', unitCode: null, year: 3 as const },
];
// The categories as GET /forum/meta could list them.
const CATEGORIES: { id: string; year: 1 | 2 | 3 | null }[] = [
  { id: 'year-1', year: 1 },
  { id: 'year-2', year: 2 },
  { id: 'year-3', year: 3 },
  { id: 'study-groups', year: null },
  { id: 'general', year: null },
];
const find: PresetLookups = {
  getModule: (id) => MODULES.find((m) => m.id === id) ?? null,
  getModuleByUnitCode: (code) => MODULES.find((m) => m.unitCode === code) ?? null,
  getCategory: (id) => CATEGORIES.find((c) => c.id === id) ?? null,
  categoryForYear: (year) => CATEGORIES.find((c) => c.year != null && c.year === year)?.id ?? null,
  defaultCategory: 'general',
};
const presets = (query: string, ownYear: number | null = 2) =>
  composerPresets(new URLSearchParams(query), find, ownYear);

describe('composerPresets', () => {
  it('asks for nothing without presets, so a stored draft can come back', () => {
    expect(presets('')).toBeNull();
    expect(presets('title=%20%20&category=nowhere&module=gone')).toBeNull();
  });

  it('takes the details, cut to the composer’s limit', () => {
    const body = 'About [ST2133 · May 2019 · Zone A](https://hub.example/library/st2133-2019-za)';
    expect(presets(`module=ST2133&body=${encodeURIComponent(body)}`)).toEqual({
      title: '',
      body,
      category: 'year-2',
      moduleId: 'advanced-stats-distribution',
      tags: [],
    });
    expect(presets(`body=${'x'.repeat(BODY_MAX + 10)}`)?.body).toHaveLength(BODY_MAX);
  });

  it('posts about a module in its year', () => {
    expect(presets('module=mathematics')).toEqual({
      title: '',
      body: '',
      category: 'year-1',
      moduleId: 'mathematics',
      tags: [],
    });
  });

  it('finds a module by its unit code, in any case', () => {
    expect(presets('module=st2133')).toMatchObject({ category: 'year-2', moduleId: 'advanced-stats-distribution' });
  });

  it('lets a year that disagrees with the module follow the module; a category without a year keeps it', () => {
    expect(presets('category=year-3&module=mathematics')).toMatchObject({
      category: 'year-1',
      moduleId: 'mathematics',
    });
    expect(presets('category=study-groups&module=mathematics')).toMatchObject({
      category: 'study-groups',
      moduleId: 'mathematics',
    });
  });

  it('falls back to the person’s own year, then the default category', () => {
    expect(presets('title=Calculators%20in%20the%20exam', 3)).toMatchObject({ category: 'year-3', moduleId: '' });
    expect(presets('title=Calculators%20in%20the%20exam', null)).toMatchObject({ category: 'general' });
  });

  it('cuts a long title to the composer’s limit', () => {
    expect(presets(`title=${'a'.repeat(TITLE_MAX + 30)}`)?.title).toHaveLength(TITLE_MAX);
  });
});
