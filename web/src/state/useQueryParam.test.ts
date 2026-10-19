import { describe, expect, it } from 'vitest';
import { withQueryParams } from './useQueryParam';

describe('withQueryParams', () => {
  it('sets and removes several params in one address', () => {
    const prev = new URLSearchParams('module=economics&lesson=xfm6xyvy&q=tax');
    expect(withQueryParams(prev, { module: 'st2134', lesson: null }).toString()).toBe('module=st2134&q=tax');
  });

  it('clears every named filter at once and keeps the rest', () => {
    const prev = new URLSearchParams('kind=module&status=done&mine=1&sort=new');
    expect(withQueryParams(prev, { kind: null, status: undefined, mine: '' }).toString()).toBe('sort=new');
  });

  it('adds params that were not there, numbers as text', () => {
    expect(withQueryParams(new URLSearchParams(), { month: '2026-11', page: 2 }).toString()).toBe(
      'month=2026-11&page=2',
    );
  });

  it('leaves the address it was given alone', () => {
    const prev = new URLSearchParams('module=economics');
    withQueryParams(prev, { module: null });
    expect(prev.toString()).toBe('module=economics');
  });
});
