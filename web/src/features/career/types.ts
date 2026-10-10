// Career Navigator: the shapes of its content. The whole document comes from GET /api/v1/career (`data`), edited
// by admins as one JSON document; api.ts checks its shape before the page uses it.
import type { CohortYear } from '../../lib/modules';

export type OfferType = 'graduate' | 'internship' | 'careers';
export type Cta = 'apply' | 'programme' | 'roles';

export interface Track {
  id: string;
  label: string;
  short: string;
  about: string;
  /** Module ids: the closest modules for the track. */
  modules: string[];
}

export interface Offer {
  type: OfferType;
  /** Only when the programme's name was seen on the employer's own site. */
  name?: string;
}

/** A real employer with a presence in Bahrain. `id` is also its logo file: public/logos/employers/<id>.png */
export interface Employer {
  id: string;
  name: string;
  /** The initials on the neutral tile until the logo file is supplied. */
  mono: string;
  sector: string;
  offers: Offer[];
  /** Track ids, most relevant first (our guide to the kind of work, not vacancies). */
  tracks: string[];
  why: string;
  /** The employer's own careers or programme page. */
  url: string;
  cta: Cta;
}

/** The one competition beside the page title. */
export interface Featured {
  id: string;
  kind: string;
  title: string;
  organiser: string;
  mono: string;
  logo: { kind: 'employer' | 'cert'; id: string };
  badge: string;
  blurb: string;
  note: string;
  url: string;
}

export type Effort = 1 | 2 | 3;

export interface Cert {
  id: string;
  name: string;
  short: string;
  issuer: string;
  mono?: string;
  /** The official page; none for self-study (which points at the library instead). */
  url?: string;
  file?: { module: string; id: string };
  goodFor: string;
  effort: Effort;
  effortNote: string;
  /** Module ids that already teach part of it. */
  covers: string[];
  coversNote?: string;
  /** Role ids it helps with. */
  roles: string[];
}

/** What to do about a skill DSBA never takes past an intro. */
export type CloseStep =
  | { kind: 'lesson'; module: string; chapter: string; text: string }
  | { kind: 'file'; module: string; file: string; text: string }
  | { kind: 'cert'; cert: string; text: string }
  | { kind: 'forum'; to: string; text: string }
  | { kind: 'opps'; text: string };

export interface Role {
  id: string;
  label: string;
  title: string;
  about: string;
  tools: string[];
  /** Skill ids, most important first. */
  skills: string[];
  /** The question "Ask seniors about this role" starts a thread with. */
  ask: string;
  /** Overrides of a skill's close step for this role (merged over it, then read again: see lib/links.ts). */
  close?: Record<string, Record<string, unknown>>;
}

export type Depth = 0 | 1 | 2 | 3;

export interface Skill {
  name: string;
  /** The modules that teach it and how far (1 introduced, 2 solid grounding, 3 in depth). */
  taught: { module: string; depth: Depth; what: string }[];
  gapNote?: string;
  close?: CloseStep;
}

/** A readiness checklist row; its link goes to a lesson, a certificate card or the forum. */
export interface ChecklistItem {
  id: string;
  title: string;
  hint: string;
  link?:
    | { kind: 'lesson'; module: string; chapter: string; label: string }
    | { kind: 'cert'; cert: string; label: string }
    | { kind: 'forum'; to: string; label: string };
}

/** A Year 3 student or a recent graduate who answers questions (none yet). */
export interface Senior {
  id: string;
  name: string;
  short: string;
  year?: CohortYear | null;
  badge?: string;
  helps: string;
  ask: string;
}

export interface CareerData {
  /** The day every link was last checked ('2 October 2026'). */
  checkedOn: string;
  /** Employer cards shown before "Show all". */
  initialCount: number;
  tracks: Track[];
  offerTypes: Record<OfferType, { label: string; plural: string }>;
  ctaLabel: Record<Cta, string>;
  employers: Employer[];
  featured: Featured | null;
  effortLabel: Record<string, string>;
  certNote: string;
  certs: Cert[];
  defaultRoleId: string;
  roles: Role[];
  depthLabel: Record<string, string>;
  /** Modules a student chooses ('option' or 'elective'), by module id. */
  chosen: Record<string, string>;
  skills: Record<string, Skill>;
  checklist: ChecklistItem[];
  furtherStudy: { title: string; body: string; action: { to: string; label: string } } | null;
  yearHints: Record<string, string>;
  seniors: Senior[];
}
