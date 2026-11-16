import { describe, expect, it } from 'vitest';
import type { CareerCert } from '../../../api/types';
import { certCounts, certsFiltered, fieldsOf, filterCerts, parseCertSort, sortCerts, type CertFilters } from './certs';

const cert = (id: string, over: Partial<CareerCert>): CareerCert => ({
  id,
  name: id,
  short: id,
  issuer: 'Issuer',
  mono: null,
  url: `https://${id}.example.com`,
  goodFor: '',
  effort: 2,
  effortNote: '',
  covers: [],
  coversNote: null,
  roles: [],
  hidden: false,
  ...over,
});

const cfa = cert('cfa', {
  name: 'CFA Program, Level I',
  issuer: 'CFA Institute',
  effort: 3,
  field: 'Finance',
  roles: ['financial-analyst', 'risk-analyst'],
});
const pl300 = cert('pl300', {
  name: 'Power BI Data Analyst',
  issuer: 'Microsoft',
  effort: 2,
  field: 'Tools',
  roles: ['data-analyst', 'bi-developer'],
});
const aws = cert('aws', {
  name: 'AWS Cloud Practitioner',
  issuer: 'Amazon',
  effort: 1,
  field: 'Tools',
  roles: ['data-scientist'],
  goodFor: 'A first look at the cloud.',
});
const all = [cfa, pl300, aws];
const none: CertFilters = { q: '', field: [], effort: [], role: [] };

describe('certificates as a search', () => {
  it('searches names, issuers and what each is good for', () => {
    expect(filterCerts(all, { ...none, q: 'microsoft' })).toEqual([pl300]);
    expect(filterCerts(all, { ...none, q: 'cloud first' })).toEqual([aws]);
    expect(filterCerts(all, { ...none, q: 'nothing like it' })).toEqual([]);
  });

  it('treats options in a group as any of them, and the groups as all of them', () => {
    expect(filterCerts(all, { ...none, effort: ['1', '2'] })).toEqual([pl300, aws]);
    expect(filterCerts(all, { ...none, effort: ['2', '3'], role: ['risk-analyst'] })).toEqual([cfa]);
  });

  it('counts each option against the other group', () => {
    const f = { ...none, role: ['data-analyst'] };
    expect(certCounts(all, f, 'effort')).toEqual({ '2': 1 });
    expect(certCounts(all, f, 'role')).toEqual({
      'financial-analyst': 1,
      'risk-analyst': 1,
      'data-analyst': 1,
      'bi-developer': 1,
      'data-scientist': 1,
    });
    expect(certsFiltered(none)).toBe(false);
    expect(certsFiltered(f)).toBe(true);
  });

  it('sorts by name or lightest first, or keeps the editors’ order', () => {
    expect(sortCerts(all, 'suggested').map((c) => c.id)).toEqual(['cfa', 'pl300', 'aws']);
    expect(sortCerts(all, 'name').map((c) => c.id)).toEqual(['aws', 'cfa', 'pl300']);
    expect(sortCerts(all, 'effort').map((c) => c.id)).toEqual(['aws', 'pl300', 'cfa']);
    expect(parseCertSort('effort')).toBe('effort');
    expect(parseCertSort('bogus')).toBe('suggested');
  });

  it('filters by field, and lists the fields with the most certificates first', () => {
    expect(fieldsOf(all)).toEqual(['Tools', 'Finance']);
    expect(filterCerts(all, { ...none, field: ['Tools'], effort: ['1'] })).toEqual([aws]);
    expect(certCounts(all, { ...none, effort: ['3'] }, 'field')).toEqual({ Finance: 1 });
  });
});
