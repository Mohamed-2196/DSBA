// Certificates as a search, like the vacancies (board.ts): narrowed by a text search and three filter groups (field,
// effort, and the roles each certificate helps), counted per option and sorted. Pure, so the rules are unit-tested
// (certs.test.ts); the URL holds the state.
import type { CareerCert } from '../../../api/types';
import { fold } from './board';

export type CertFacet = 'field' | 'effort' | 'role';
export type CertSort = 'suggested' | 'name' | 'effort';

export interface CertFilters {
  q: string;
  field: string[];
  effort: string[]; // '1', '2', '3'
  role: string[]; // role ids
}

export const CERT_FACETS: readonly CertFacet[] = ['field', 'effort', 'role'];

export const isCertFacet = (v: string): v is CertFacet => (CERT_FACETS as readonly string[]).includes(v);

export const parseCertSort = (raw: string | null): CertSort => (raw === 'name' || raw === 'effort' ? raw : 'suggested');

function matchesText(c: CareerCert, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(
    [c.name, c.short, c.issuer, c.mono ?? '', c.field ?? '', c.goodFor, c.effortNote, c.coversNote ?? ''].join(' '),
  );
  return words.every((w) => hay.includes(w));
}

function matchesFacet(c: CareerCert, facet: CertFacet, picked: readonly string[]): boolean {
  if (!picked.length) return true;
  if (facet === 'field') return !!c.field && picked.includes(c.field);
  if (facet === 'effort') return picked.includes(String(c.effort));
  return c.roles.some((r) => picked.includes(r));
}

function matches(c: CareerCert, f: CertFilters, skip?: CertFacet): boolean {
  return matchesText(c, f.q) && CERT_FACETS.every((facet) => facet === skip || matchesFacet(c, facet, f[facet]));
}

export const filterCerts = (certs: readonly CareerCert[], f: CertFilters): CareerCert[] =>
  certs.filter((c) => matches(c, f));

/** The fields on the list, most certificates first, then A to Z. */
export function fieldsOf(certs: readonly CareerCert[]): string[] {
  const counts = new Map<string, number>();
  for (const c of certs) if (c.field) counts.set(c.field, (counts.get(c.field) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([f]) => f);
}

const valuesOf = (c: CareerCert, facet: CertFacet): string[] =>
  facet === 'field' ? (c.field ? [c.field] : []) : facet === 'effort' ? [String(c.effort)] : c.roles;

/** How many certificates each option of a group would show, given the search and the other groups. */
export function certCounts(certs: readonly CareerCert[], f: CertFilters, facet: CertFacet): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of certs) {
    if (!matches(c, f, facet)) continue;
    for (const v of valuesOf(c, facet)) counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

export const certsFiltered = (f: CertFilters): boolean =>
  f.q.trim() !== '' || CERT_FACETS.some((facet) => f[facet].length);

/** 'suggested' keeps the editors' order; 'effort' puts the lightest first (the editors' order within a level). */
export function sortCerts(certs: readonly CareerCert[], sort: CertSort): CareerCert[] {
  if (sort === 'name') return [...certs].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  if (sort === 'effort') return [...certs].sort((a, b) => a.effort - b.effort);
  return [...certs];
}
