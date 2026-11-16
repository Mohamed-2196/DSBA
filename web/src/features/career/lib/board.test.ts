import { describe, expect, it } from 'vitest';
import type { CareerEmployer } from '../../../api/types';
import {
  NO_FILTERS,
  facetCounts,
  filterEmployers,
  isFiltered,
  listParam,
  parseList,
  parseSort,
  programmeLine,
  resultsLine,
  sectorsOf,
  sortEmployers,
} from './board';

const emp = (id: string, over: Partial<CareerEmployer>): CareerEmployer => ({
  id,
  name: id,
  mono: id.slice(0, 2).toUpperCase(),
  sector: 'Bank',
  offers: [{ type: 'careers' }],
  tracks: [],
  why: '',
  url: `https://${id}.example.com`,
  cta: 'roles',
  hidden: false,
  ...over,
});

const nbb = emp('nbb', {
  name: 'National Bank of Bahrain',
  offers: [
    { type: 'internship', name: 'EVOLVE' },
    { type: 'internship', name: 'THRIVE' },
  ],
  tracks: ['markets', 'quant'],
  why: 'A paid internship of 6 to 12 months.',
});
const kpmg = emp('kpmg', {
  name: 'KPMG',
  sector: 'Audit & consulting',
  offers: [{ type: 'graduate' }, { type: 'internship' }],
  tracks: ['consulting', 'data'],
});
const batelco = emp('batelco', {
  name: 'Batelco',
  sector: 'Telecom',
  offers: [{ type: 'graduate' }],
  tracks: ['data'],
});
const all = [nbb, kpmg, batelco];

describe('the URL lists', () => {
  it('keeps known values once, in order, and drops the rest', () => {
    expect(parseList('quant,nope,quant, data', new Set(['quant', 'data']))).toEqual(['quant', 'data']);
    expect(parseList(null, new Set(['quant']))).toEqual([]);
  });
  it('writes an empty list as no param', () => {
    expect(listParam([])).toBeNull();
    expect(listParam(['a', 'b'])).toBe('a,b');
  });
  it('sorts by closing date only when there are dates', () => {
    expect(parseSort('closing', true)).toBe('closing');
    expect(parseSort('closing', false)).toBe('suggested');
    expect(parseSort('name', false)).toBe('name');
    expect(parseSort('bogus', true)).toBe('suggested');
  });
});

describe('filtering', () => {
  it('searches names, programmes, sectors and the why, ignoring case and accents', () => {
    expect(filterEmployers(all, { ...NO_FILTERS, q: 'thrive' })).toEqual([nbb]);
    expect(filterEmployers(all, { ...NO_FILTERS, q: 'TELECOM' })).toEqual([batelco]);
    expect(filterEmployers(all, { ...NO_FILTERS, q: 'paid  internship' })).toEqual([nbb]);
    expect(filterEmployers(all, { ...NO_FILTERS, q: 'kpmg zzz' })).toEqual([]);
  });
  it('treats options in a group as any of them, and groups as all of them', () => {
    expect(filterEmployers(all, { ...NO_FILTERS, type: ['graduate', 'internship'] })).toEqual(all);
    expect(filterEmployers(all, { ...NO_FILTERS, type: ['graduate'], track: ['data'] })).toEqual([kpmg, batelco]);
    expect(filterEmployers(all, { ...NO_FILTERS, type: ['graduate'], sector: ['Telecom'] })).toEqual([batelco]);
  });
  it('counts each option against the search and the other groups, not its own group', () => {
    const f = { ...NO_FILTERS, type: ['graduate'], track: ['quant'] };
    expect(facetCounts(all, f, 'type')).toEqual({ internship: 1 });
    expect(facetCounts(all, f, 'track')).toEqual({ consulting: 1, data: 2 });
    expect(facetCounts(all, NO_FILTERS, 'sector')).toEqual({ Bank: 1, 'Audit & consulting': 1, Telecom: 1 });
  });
  it('knows when anything is narrowing the list', () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, q: '  ' })).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, sector: ['Bank'] })).toBe(true);
  });
});

describe('sorting and the lines around the list', () => {
  it('keeps the editors’ order, sorts by name, or puts the soonest closing first', () => {
    expect(sortEmployers(all, 'suggested', new Map()).map((e) => e.id)).toEqual(['nbb', 'kpmg', 'batelco']);
    expect(sortEmployers(all, 'name', new Map()).map((e) => e.id)).toEqual(['batelco', 'kpmg', 'nbb']);
    const closes = new Map([
      ['batelco', '2026-12-01'],
      ['kpmg', '2026-11-20'],
    ]);
    expect(sortEmployers(all, 'closing', closes).map((e) => e.id)).toEqual(['kpmg', 'batelco', 'nbb']);
  });
  it('lists the sectors with the most employers first', () => {
    expect(sectorsOf([...all, emp('bbk', {})])).toEqual(['Bank', 'Audit & consulting', 'Telecom']);
  });
  it('joins programme names and says how many show', () => {
    expect(programmeLine(nbb)).toBe('EVOLVE and THRIVE');
    expect(programmeLine(kpmg)).toBe('');
    expect(resultsLine(12, 29)).toBe('1 to 12 of 29 employers');
    expect(resultsLine(1, 1)).toBe('1 employer');
    expect(resultsLine(0, 0)).toBe('No employers');
  });
});
