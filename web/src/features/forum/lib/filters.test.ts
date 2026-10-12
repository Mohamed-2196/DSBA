import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, keepFilters, patchFilters, readFilters } from './filters';

const url = (s: string) => new URLSearchParams(s);

describe('readFilters', () => {
  it('reads every filter from the URL', () => {
    expect(readFilters(url('cohort=year-2&tag=r&sort=new&q=mgf&status=no-replies&module=mathematics'))).toEqual({
      cohort: 'year-2',
      tag: 'r',
      sort: 'new',
      q: 'mgf',
      status: 'no-replies',
      module: 'mathematics',
    });
  });
  it('falls back to the defaults for anything it does not know', () => {
    expect(readFilters(url('cohort=year-9&sort=random&status=closed'))).toEqual(DEFAULT_FILTERS);
    expect(readFilters(url(''))).toEqual(DEFAULT_FILTERS);
  });
});

describe('patchFilters', () => {
  it('sets several filters at once and keeps other params', () => {
    expect(patchFilters(url('order=oldest&cohort=year-1'), { cohort: 'year-2', q: 'mgf' }).toString()).toBe('order=oldest&cohort=year-2&q=mgf');
  });
  it('drops empty and default values, so links stay short', () => {
    expect(patchFilters(url('sort=new&tag=r&q=x'), { sort: 'hot', tag: '', q: null }).toString()).toBe('');
  });
});

describe('keepFilters', () => {
  it('clears everything but the filters asked for', () => {
    expect(keepFilters(url('cohort=year-2&sort=top&tag=r&q=mgf'), ['cohort', 'sort']).toString()).toBe('cohort=year-2&sort=top');
    expect(keepFilters(url('cohort=year-2'), []).toString()).toBe('');
  });
});
