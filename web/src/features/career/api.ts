// Career Navigator content from the API (GET /api/v1/career): one JSON document. It is read into the types
// in ./types.ts here, keeping what has the right shape and dropping what doesn't, so a slip in the admin's
// document hides one card instead of breaking the page. Links must be web addresses (https or http).
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { ModuleDetail } from '../../api/types';
import { safeHref, safeInternalPath } from '../../ui';
import type { CareerData, Cert, ChecklistItem, CloseStep, Cta, Depth, Effort, Employer, Featured, Offer, OfferType, Role, Senior, Skill, Track } from './types';

export const CAREER_KEY = ['career'] as const;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
const list = <T>(v: unknown, read: (x: Rec) => T | null): T[] => (Array.isArray(v) ? v.filter(isRec).map(read).filter((x): x is T => x !== null) : []);
const strRecord = (v: unknown): Record<string, string> =>
  isRec(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};

/**
 * A web address for a button that opens another site, or null (security review, finding 12): ui/safeHref's
 * external rule, without mailto: (every career button opens a page).
 */
export function webUrl(v: unknown): string | null {
  const h = safeHref(str(v));
  return h?.kind === 'external' && /^https?:/.test(h.href) ? h.href : null;
}

/** An app path ('/forum/new?…', never '//host' or '/\\host'), or null. */
const appPath = (v: unknown): string | null => safeInternalPath(str(v));

const OFFER_TYPES: readonly OfferType[] = ['graduate', 'internship', 'careers'];
const CTAS: readonly Cta[] = ['apply', 'programme', 'roles'];

function readTrack(t: Rec): Track | null {
  const id = str(t.id);
  const label = str(t.label);
  if (!id || !label) return null;
  return { id, label, short: str(t.short) ?? label, about: str(t.about) ?? '', modules: strs(t.modules) };
}

function readEmployer(e: Rec): Employer | null {
  const id = str(e.id);
  const name = str(e.name);
  const url = webUrl(e.url);
  if (!id || !name || !url) return null;
  const offers: Offer[] = list(e.offers, (o) => {
    const type = OFFER_TYPES.find((t) => t === o.type);
    if (!type) return null;
    const offerName = str(o.name);
    return offerName ? { type, name: offerName } : { type };
  });
  const cta = CTAS.find((c) => c === e.cta) ?? 'roles';
  return { id, name, mono: str(e.mono) ?? name.slice(0, 3), sector: str(e.sector) ?? '', offers, tracks: strs(e.tracks), why: str(e.why) ?? '', url, cta };
}

function readFeatured(f: unknown): Featured | null {
  if (!isRec(f)) return null;
  const id = str(f.id);
  const title = str(f.title);
  const url = webUrl(f.url);
  if (!id || !title || !url) return null;
  const logo = isRec(f.logo) && str(f.logo.id) ? { kind: f.logo.kind === 'employer' ? ('employer' as const) : ('cert' as const), id: str(f.logo.id) ?? '' } : { kind: 'cert' as const, id };
  return {
    id,
    title,
    url,
    logo,
    kind: str(f.kind) ?? '',
    organiser: str(f.organiser) ?? '',
    mono: str(f.mono) ?? title.slice(0, 3),
    badge: str(f.badge) ?? '',
    blurb: str(f.blurb) ?? '',
    note: str(f.note) ?? '',
  };
}

const toEffort = (v: unknown): Effort => (v === 1 || v === 2 || v === 3 ? v : 2);
const toDepth = (v: unknown): Depth => (v === 0 || v === 1 || v === 2 || v === 3 ? v : 0);

function readCert(c: Rec): Cert | null {
  const id = str(c.id);
  const name = str(c.name);
  if (!id || !name) return null;
  const url = webUrl(c.url);
  const file = isRec(c.file) && str(c.file.module) && str(c.file.id) ? { module: str(c.file.module) ?? '', id: str(c.file.id) ?? '' } : undefined;
  return {
    id,
    name,
    short: str(c.short) ?? name,
    issuer: str(c.issuer) ?? '',
    ...(str(c.mono) ? { mono: str(c.mono) ?? '' } : {}),
    ...(url ? { url } : {}),
    ...(file ? { file } : {}),
    goodFor: str(c.goodFor) ?? '',
    effort: toEffort(c.effort),
    effortNote: str(c.effortNote) ?? '',
    covers: strs(c.covers),
    ...(str(c.coversNote) ? { coversNote: str(c.coversNote) ?? '' } : {}),
    roles: strs(c.roles),
  };
}

/** A close step ("what to do about this gap"), or null when it isn't one. */
export function readClose(c: unknown): CloseStep | null {
  if (!isRec(c)) return null;
  const text = str(c.text);
  if (!text) return null;
  switch (c.kind) {
    case 'lesson': {
      const module = str(c.module);
      return module ? { kind: 'lesson', module, chapter: str(c.chapter) ?? '', text } : null;
    }
    case 'file': {
      const module = str(c.module);
      return module ? { kind: 'file', module, file: str(c.file) ?? '', text } : null;
    }
    case 'cert': {
      const cert = str(c.cert);
      return cert ? { kind: 'cert', cert, text } : null;
    }
    case 'forum': {
      const to = appPath(c.to);
      return to ? { kind: 'forum', to, text } : null;
    }
    case 'opps':
      return { kind: 'opps', text };
    default:
      return null;
  }
}

function readRole(r: Rec): Role | null {
  const id = str(r.id);
  const label = str(r.label);
  if (!id || !label) return null;
  const close: Record<string, Record<string, unknown>> = {};
  if (isRec(r.close)) {
    for (const [skill, over] of Object.entries(r.close)) if (isRec(over)) close[skill] = over;
  }
  return { id, label, title: str(r.title) ?? label, about: str(r.about) ?? '', tools: strs(r.tools), skills: strs(r.skills), ask: str(r.ask) ?? '', close };
}

function readSkill(s: unknown): Skill | null {
  if (!isRec(s)) return null;
  const name = str(s.name);
  if (!name) return null;
  const taught = list(s.taught, (t) => {
    const module = str(t.module);
    return module ? { module, depth: toDepth(t.depth), what: str(t.what) ?? '' } : null;
  });
  const close = readClose(s.close);
  return { name, taught, ...(str(s.gapNote) ? { gapNote: str(s.gapNote) ?? '' } : {}), ...(close ? { close } : {}) };
}

function readChecklistItem(c: Rec): ChecklistItem | null {
  const id = str(c.id);
  const title = str(c.title);
  if (!id || !title) return null;
  let link: ChecklistItem['link'];
  if (isRec(c.link)) {
    const label = str(c.link.label) ?? 'Open';
    if (c.link.kind === 'lesson' && str(c.link.module)) link = { kind: 'lesson', module: str(c.link.module) ?? '', chapter: str(c.link.chapter) ?? '', label };
    else if (c.link.kind === 'cert' && str(c.link.cert)) link = { kind: 'cert', cert: str(c.link.cert) ?? '', label };
    else if (c.link.kind === 'forum' && appPath(c.link.to)) link = { kind: 'forum', to: appPath(c.link.to) ?? '/forum', label };
  }
  return { id, title, hint: str(c.hint) ?? '', ...(link ? { link } : {}) };
}

function readSenior(s: Rec): Senior | null {
  const id = str(s.id);
  const name = str(s.name);
  if (!id || !name) return null;
  const year = s.year === 1 || s.year === 2 || s.year === 3 ? s.year : null;
  return { id, name, short: str(s.short) ?? name, year, ...(str(s.badge) ? { badge: str(s.badge) ?? '' } : {}), helps: str(s.helps) ?? '', ask: str(s.ask) ?? '' };
}

/** The Career Navigator document, or null when it isn't one (an empty document before the first import). */
export function readCareer(raw: unknown): CareerData | null {
  if (!isRec(raw)) return null;
  const employers = list(raw.employers, readEmployer);
  const roles = list(raw.roles, readRole);
  const certs = list(raw.certs, readCert);
  if (!employers.length && !roles.length && !certs.length) return null;
  const skills: Record<string, Skill> = {};
  if (isRec(raw.skills)) {
    for (const [id, s] of Object.entries(raw.skills)) {
      const skill = readSkill(s);
      if (skill) skills[id] = skill;
    }
  }
  const offerTypes = isRec(raw.offerTypes) ? raw.offerTypes : {};
  const offer = (t: OfferType, label: string, plural: string) => {
    const o = offerTypes[t];
    return isRec(o) ? { label: str(o.label) ?? label, plural: str(o.plural) ?? plural } : { label, plural };
  };
  const ctaLabel = strRecord(raw.ctaLabel);
  const further = isRec(raw.furtherStudy) ? raw.furtherStudy : null;
  const furtherAction = further && isRec(further.action) ? { to: appPath(further.action.to), label: str(further.action.label) } : null;
  return {
    checkedOn: str(raw.checkedOn) ?? '',
    initialCount: typeof raw.initialCount === 'number' && raw.initialCount > 0 ? raw.initialCount : 12,
    tracks: list(raw.tracks, readTrack),
    offerTypes: {
      graduate: offer('graduate', 'Graduate programme', 'Graduate programmes'),
      internship: offer('internship', 'Internship', 'Internships'),
      careers: offer('careers', 'Careers page', 'Careers pages'),
    },
    ctaLabel: { apply: ctaLabel.apply ?? 'Apply', programme: ctaLabel.programme ?? 'See the programme', roles: ctaLabel.roles ?? 'See open roles' },
    employers,
    featured: readFeatured(raw.featured),
    effortLabel: { 1: 'Light', 2: 'Medium', 3: 'Heavy', ...strRecord(raw.effortLabel) },
    certNote: str(raw.certNote) ?? '',
    certs,
    defaultRoleId: str(raw.defaultRoleId) ?? roles[0]?.id ?? '',
    roles,
    depthLabel: { 0: 'Not taught', 1: 'Intro only', 2: 'Solid', 3: 'In depth', ...strRecord(raw.depthLabel) },
    chosen: strRecord(raw.chosen),
    skills,
    checklist: list(raw.checklist, readChecklistItem),
    furtherStudy:
      further && str(further.title) && furtherAction?.to && furtherAction.label
        ? { title: str(further.title) ?? '', body: str(further.body) ?? '', action: { to: furtherAction.to, label: furtherAction.label } }
        : null,
    yearHints: strRecord(raw.yearHints),
    seniors: list(raw.seniors, readSenior),
  };
}

/** The Career Navigator's content; data is null when the document is empty. */
export function useCareer() {
  return useQuery({
    queryKey: CAREER_KEY,
    queryFn: async () => (await call(api.GET('/api/v1/career'))).data,
    select: readCareer,
    staleTime: 10 * 60_000,
  });
}

/** A module with its chapters (for links straight to a lesson). Shares its cache entry with other features. */
export function useModuleDetail(moduleId: string | null | undefined) {
  return useQuery({
    queryKey: ['modules', 'detail', moduleId ?? ''] as const,
    queryFn: (): Promise<ModuleDetail> => call(api.GET('/api/v1/modules/{module_id}', { params: { path: { module_id: moduleId ?? '' } } })),
    enabled: !!moduleId,
    staleTime: Infinity,
  });
}
