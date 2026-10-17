// Site settings, read: the lines the footer and About print from them. Plain functions, tested in site.test.ts.
import type { SiteContributor, SiteDoc } from '../../../api/types';
import { safeHref } from '../../../ui/safeHref';

/** One of the hub's saved links, by its name in the settings (the guides point at them by this name). */
export type SiteLinkKey = keyof SiteDoc['links'];

/** The line under a contributor's name: their role, with their affiliation when they have one; null with no role. */
export function contributorLine(c: Pick<SiteContributor, 'role' | 'affiliation'>): string | null {
  if (!c.role) return null;
  return c.affiliation ? `${c.role}, ${c.affiliation}` : c.role;
}

/** '2024–2026', or '2026' in the launch year (or before it). */
export function copyrightYears(launchYear: number, now: Date = new Date()): string {
  const year = now.getFullYear();
  return year > launchYear ? `${launchYear}–${year}` : `${year}`;
}

/** Where a student's shared notes for a module are: the module's notes in the library. */
export const notesInLibrary = (moduleId: string): string => `/library?module=${encodeURIComponent(moduleId)}&type=notes`;

/** An https:// address from the settings, for an `href`; null for anything else (the API allows https:// only). */
export function httpsHref(url: string | null | undefined): string | null {
  const safe = safeHref(url);
  return safe?.kind === 'external' && safe.href.startsWith('https:') ? safe.href : null;
}
