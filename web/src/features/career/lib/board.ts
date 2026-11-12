// Vacancies as a search: the employers narrowed by a text search and three filter groups (what is offered, track,
// sector), counted per option and sorted. Pure, so the rules are unit-tested (board.test.ts); the URL holds the state.
import type { CareerEmployer, CareerOffer } from '../../../api/types';

export type OfferType = CareerOffer['type'];
export type BoardFacet = 'type' | 'track' | 'sector';
export type BoardSort = 'suggested' | 'name' | 'closing';

export interface BoardFilters {
  q: string;
  type: string[];
  track: string[];
  sector: string[];
}

export const NO_FILTERS: BoardFilters = { q: '', type: [], track: [], sector: [] };

export const FACETS: readonly BoardFacet[] = ['type', 'track', 'sector'];

export const isFacet = (v: string): v is BoardFacet => (FACETS as readonly string[]).includes(v);

export const OFFER_ORDER: readonly OfferType[] = ['graduate', 'internship', 'careers'];

/** A comma list from the URL ('quant,data'), keeping only known values, each once, in the order given. */
export function parseList(raw: string | null, known: ReadonlySet<string>): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((v) => v.trim()))].filter((v) => known.has(v));
}

/** The URL form of a list: null when empty, so the param goes. */
export const listParam = (values: readonly string[]): string | null => (values.length ? values.join(',') : null);

/** The sort from the URL; 'closing' only when some employer has an application date to sort by. */
export function parseSort(raw: string | null, canClose: boolean): BoardSort {
  if (raw === 'name') return 'name';
  if (raw === 'closing' && canClose) return 'closing';
  return 'suggested';
}

/** The distinct offer types of an employer, in the order graduate, internship, careers. */
export const offerTypesOf = (e: CareerEmployer): OfferType[] =>
  OFFER_ORDER.filter((type) => e.offers.some((o) => o.type === type));

/** 'EVOLVE and THRIVE' from the named offers of an employer. */
export function programmeLine(e: CareerEmployer): string {
  const names = e.offers.map((o) => o.name).filter((n): n is string => !!n);
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Lower case without accents, for matching a search. */
export const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every word of the search appears in the employer's name, initials, sector, programmes or why it is listed. */
function matchesText(e: CareerEmployer, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([e.name, e.mono ?? '', e.sector, programmeLine(e), e.why].join(' '));
  return words.every((w) => hay.includes(w));
}

/** Inside a group the options are alternatives (any of them); the groups and the search narrow each other. */
function matchesFacet(e: CareerEmployer, facet: BoardFacet, picked: readonly string[]): boolean {
  if (!picked.length) return true;
  if (facet === 'type') return e.offers.some((o) => picked.includes(o.type));
  if (facet === 'track') return e.tracks.some((t) => picked.includes(t));
  return picked.includes(e.sector);
}

function matches(e: CareerEmployer, f: BoardFilters, skip?: BoardFacet): boolean {
  return matchesText(e, f.q) && FACETS.every((facet) => facet === skip || matchesFacet(e, facet, f[facet]));
}

export const filterEmployers = (employers: readonly CareerEmployer[], f: BoardFilters): CareerEmployer[] =>
  employers.filter((e) => matches(e, f));

/** How many employers each option of a group would show, given the search and the other groups. */
export function facetCounts(
  employers: readonly CareerEmployer[],
  f: BoardFilters,
  facet: BoardFacet,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of employers) {
    if (!matches(e, f, facet)) continue;
    const values = facet === 'type' ? offerTypesOf(e) : facet === 'track' ? e.tracks : [e.sector];
    for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

/** The sectors on the board, most employers first, then A to Z. */
export function sectorsOf(employers: readonly CareerEmployer[]): string[] {
  const counts = new Map<string, number>();
  for (const e of employers) counts.set(e.sector, (counts.get(e.sector) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

export const isFiltered = (f: BoardFilters): boolean => f.q.trim() !== '' || FACETS.some((facet) => f[facet].length);

/**
 * The employers in the chosen order. 'suggested' keeps the editors' order; 'closing' puts the employers with an
 * application date first, the soonest first, and keeps the editors' order for the rest. `closes` maps an employer's
 * id to the day its applications close.
 */
export function sortEmployers(
  employers: readonly CareerEmployer[],
  sort: BoardSort,
  closes: ReadonlyMap<string, string>,
): CareerEmployer[] {
  if (sort === 'name') return [...employers].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  if (sort === 'closing') {
    const rank = (e: CareerEmployer) => closes.get(e.id) ?? '￿';
    return [...employers].sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
  }
  return [...employers];
}

/** '1 to 12 of 29 employers', or '29 employers' when every match shows. */
export function resultsLine(
  shown: number,
  total: number,
  { one, many }: { one: string; many: string } = { one: 'employer', many: 'employers' },
): string {
  if (!total) return `No ${many}`;
  const noun = total === 1 ? one : many;
  return shown < total ? `1 to ${shown} of ${total} ${noun}` : `${total} ${noun}`;
}
