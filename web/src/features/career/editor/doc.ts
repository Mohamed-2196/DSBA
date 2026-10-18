// The Career Navigator editor's rules, kept out of the components so they can be tested: new ids, moving items,
// what removing or renaming an item does to the parts that point at it, what the public page shows, and where an
// error the API returns belongs.
import type { CareerDoc } from '../../../api/types';
import type { DocShape } from '../../../ui/docEditor';

/** The kinds of item other parts of the document refer to by id. */
export type RefKind = 'track' | 'role' | 'skill' | 'cert' | 'employer';

/** The editor's sections, in the order they are listed. */
export const SECTIONS = [
  'employers',
  'tracks',
  'roles',
  'skills',
  'electives',
  'certs',
  'featured',
  'checklist',
  'furtherStudy',
  'text',
] as const;
export type EditorSection = (typeof SECTIONS)[number];

/** 'Bank of Bahrain & Kuwait' -> 'bank-of-bahrain-kuwait': lowercase words joined by dashes, 64 characters at most. */
export function idFrom(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

/** A free id built from `name` (or `fallback`), among `taken`: 'nbb', then 'nbb-2'. */
export function freeId(name: string, taken: Iterable<string>, fallback = 'new'): string {
  const used = new Set(taken);
  const base = idFrom(name) || fallback;
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const id = `${base.slice(0, 60)}-${n}`;
    if (!used.has(id)) return id;
  }
}

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The list with the item at `from` moved by `by` places (kept inside the list). */
export function moveItem<T>(items: readonly T[], from: number, by: number): T[] {
  const to = Math.max(0, Math.min(items.length - 1, from + by));
  if (to === from || from < 0 || from >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** A map with the key `from` renamed to `to` (in place in the order), or removed when `to` is null. */
function renameKey<V>(map: Record<string, V>, from: string, to: string | null): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k !== from) out[k] = v;
    else if (to !== null) out[to] = v;
  }
  return out;
}

const swap = (list: readonly string[], from: string, to: string | null): string[] => {
  const out: string[] = [];
  for (const x of list) {
    const next = x === from ? to : x;
    if (next !== null && !out.includes(next)) out.push(next);
  }
  return out;
};

/**
 * Every reference to the `kind` item `from`, pointed at `to` instead (a new item's id changed), or dropped when `to`
 * is null (the item was removed). The item itself is the caller's to rename or remove. The two references that
 * can't be dropped (the role the page opens on, the featured competition's logo) are what removalBlocker() reports.
 */
export function replaceRef(doc: CareerDoc, kind: RefKind, from: string, to: string | null): CareerDoc {
  switch (kind) {
    case 'track':
      return { ...doc, employers: doc.employers.map((e) => ({ ...e, tracks: swap(e.tracks, from, to) })) };
    case 'role':
      return {
        ...doc,
        defaultRoleId: doc.defaultRoleId === from && to !== null ? to : doc.defaultRoleId,
        certs: doc.certs.map((c) => ({ ...c, roles: swap(c.roles, from, to) })),
      };
    case 'skill':
      return {
        ...doc,
        roles: doc.roles.map((r) => ({ ...r, skills: swap(r.skills, from, to), close: renameKey(r.close, from, to) })),
      };
    case 'cert': {
      type Step = CareerDoc['skills'][string]['close'];
      const step = (s: Step): Step =>
        s?.kind === 'cert' && s.cert === from ? (to === null ? null : { ...s, cert: to }) : s;
      const featured =
        doc.featured && doc.featured.logo.kind === 'cert' && doc.featured.logo.id === from && to !== null
          ? { ...doc.featured, logo: { kind: 'cert' as const, id: to } }
          : doc.featured;
      return {
        ...doc,
        featured,
        skills: Object.fromEntries(Object.entries(doc.skills).map(([k, s]) => [k, { ...s, close: step(s.close) }])),
        roles: doc.roles.map((r) => ({
          ...r,
          close: Object.fromEntries(
            Object.entries(r.close).flatMap(([k, s]) => {
              const next = step(s);
              return next ? [[k, next]] : [];
            }),
          ),
        })),
        checklist: doc.checklist.map((i) =>
          i.link?.kind === 'cert' && i.link.cert === from
            ? { ...i, link: to === null ? null : { ...i.link, cert: to } }
            : i,
        ),
      };
    }
    case 'employer': {
      const featured =
        doc.featured && doc.featured.logo.kind === 'employer' && doc.featured.logo.id === from && to !== null
          ? { ...doc.featured, logo: { kind: 'employer' as const, id: to } }
          : doc.featured;
      return { ...doc, featured };
    }
  }
}

/** Why the item can't be removed or hidden as things are (null when it can). */
export function removalBlocker(doc: CareerDoc, kind: RefKind, id: string): string | null {
  if (kind === 'role' && doc.defaultRoleId === id)
    return 'The page opens on this role. Choose another one first, at the top of Roles.';
  if ((kind === 'employer' || kind === 'cert') && doc.featured?.logo.kind === kind && doc.featured.logo.id === id) {
    return 'The featured competition shows this logo. Choose another one in Featured first.';
  }
  return null;
}

/** Removes the item and every reference to it. */
export function removeItem(doc: CareerDoc, kind: RefKind, id: string): CareerDoc {
  const next = replaceRef(doc, kind, id, null);
  switch (kind) {
    case 'track':
      return { ...next, tracks: next.tracks.filter((t) => t.id !== id) };
    case 'role':
      return { ...next, roles: next.roles.filter((r) => r.id !== id) };
    case 'skill':
      return { ...next, skills: renameKey(next.skills, id, null) };
    case 'cert':
      return { ...next, certs: next.certs.filter((c) => c.id !== id) };
    case 'employer':
      return { ...next, employers: next.employers.filter((e) => e.id !== id) };
  }
}

/** Gives a not-yet-saved item a new id, and every reference to it follows. */
export function renameItem(doc: CareerDoc, kind: RefKind, from: string, to: string): CareerDoc {
  if (from === to) return doc;
  const next = replaceRef(doc, kind, from, to);
  const rename = <T extends { id: string }>(list: T[]): T[] => list.map((x) => (x.id === from ? { ...x, id: to } : x));
  switch (kind) {
    case 'track':
      return { ...next, tracks: rename(next.tracks) };
    case 'role':
      return { ...next, roles: rename(next.roles) };
    case 'skill':
      return { ...next, skills: renameKey(next.skills, from, to) };
    case 'cert':
      return { ...next, certs: rename(next.certs) };
    case 'employer':
      return { ...next, employers: rename(next.employers) };
  }
}

/**
 * What the public page shows: the document without its hidden parts or anything pointing at them. The API does the
 * same (services/career.py public_doc); this is for the editor's preview.
 */
export function publicDoc(doc: CareerDoc): CareerDoc {
  const tracks = doc.tracks.filter((t) => !t.hidden);
  const certs = doc.certs.filter((c) => !c.hidden);
  const roles = doc.roles.filter((r) => !r.hidden);
  const trackIds = new Set(tracks.map((t) => t.id));
  const certIds = new Set(certs.map((c) => c.id));
  const roleIds = new Set(roles.map((r) => r.id));
  type Step = CareerDoc['skills'][string]['close'];
  const shown = (s: Step): boolean => !(s?.kind === 'cert' && !certIds.has(s.cert));
  return {
    ...doc,
    tracks,
    employers: doc.employers
      .filter((e) => !e.hidden)
      .map((e) => ({ ...e, tracks: e.tracks.filter((t) => trackIds.has(t)) })),
    certs: certs.map((c) => ({ ...c, roles: c.roles.filter((r) => roleIds.has(r)) })),
    roles: roles.map((r) => ({ ...r, close: Object.fromEntries(Object.entries(r.close).filter(([, s]) => shown(s))) })),
    skills: Object.fromEntries(
      Object.entries(doc.skills).map(([k, s]) => [k, { ...s, close: shown(s.close) ? s.close : null }]),
    ),
    checklist: doc.checklist
      .filter((i) => !i.hidden)
      .map((i) => (i.link?.kind === 'cert' && !certIds.has(i.link.cert) ? { ...i, link: null } : i)),
  };
}

/** The document's shape for docErrors: the lists and parts whose own messages are about all of them, and the two
 *  places that hold a step or a link of one of several kinds. */
export const CAREER_SHAPE: DocShape = {
  wholes: [
    'tracks',
    'offerTypes',
    'ctaLabel',
    'employers',
    'featured',
    'effortLabel',
    'certs',
    'roles',
    'depthLabel',
    'skills',
    'checklist',
    'furtherStudy',
    'yearHints',
  ],
  unions: ['skills.*.close', 'roles.*.close.*', 'checklist.*.link'],
};

/** The parts of the document each section edits, as errors name them ('employers.3.why'). */
const PART_SECTION: Record<string, EditorSection> = {
  employers: 'employers',
  tracks: 'tracks',
  roles: 'roles',
  defaultRoleId: 'roles',
  skills: 'skills',
  chosen: 'electives',
  certs: 'certs',
  featured: 'featured',
  checklist: 'checklist',
  furtherStudy: 'furtherStudy',
};

export interface ErrorPlace {
  section: EditorSection;
  /** the list item (its index, or a skill's id) the error is about, if any */
  item: string | null;
}

/** Where the first field error (by its path under the document) belongs, to open it; null when there is none. */
export function errorPlace(fields: Record<string, string>): ErrorPlace | null {
  for (const key of Object.keys(fields)) {
    const [part, item] = key.split('.');
    if (!part) continue;
    return { section: PART_SECTION[part] ?? 'text', item: item ?? null };
  }
  return null;
}

/** The ids each list had when it was loaded: the others are new, and their ids can still change. */
export function savedIdsOf(saved: CareerDoc, section: EditorSection): string[] {
  switch (section) {
    case 'tracks':
      return saved.tracks.map((x) => x.id);
    case 'employers':
      return saved.employers.map((x) => x.id);
    case 'roles':
      return saved.roles.map((x) => x.id);
    case 'certs':
      return saved.certs.map((x) => x.id);
    case 'checklist':
      return saved.checklist.map((x) => x.id);
    case 'skills':
      return Object.keys(saved.skills);
    default:
      return [];
  }
}
