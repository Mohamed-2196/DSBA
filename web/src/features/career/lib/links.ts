// Career Navigator: turn the document's links and "close this gap" steps into real destinations. A lesson link is
// looked up in the module's chapters (from the API) by the chapter's title, so a renamed chapter degrades to the
// module's lessons instead of a dead link. Library files are found through the library itself, filtered by module.
import type { CareerDoc, CareerSkill, ModuleDetail } from '../../../api/types';
import { safeHref, safeInternalPath } from '../../../ui/safeHref';

/** What to do about a skill DSBA never takes past an intro. */
export type CloseStep = NonNullable<CareerSkill['close']>;

/**
 * A web address for a button that opens another site, or null (security review, finding 12): ui/safeHref's external
 * rule, without mailto: (every career button opens a page). The API only takes https:// links; this is the check
 * where the link is drawn.
 */
export function webUrl(raw: string | null | undefined): string | null {
  const h = safeHref(raw);
  return h?.kind === 'external' && /^https?:/.test(h.href) ? h.href : null;
}

/** A page of the Hub ('/forum/new?…', never '//host' or '/\\host'), or null. */
export const appPath = (raw: string | null | undefined): string | null => safeInternalPath(raw);

/** The first lesson of the first chapter whose title starts with `prefix`, or the module's lessons. */
export function lessonPath(moduleId: string, prefix: string, module: ModuleDetail | undefined): string {
  const id = encodeURIComponent(moduleId);
  const base = `/modules/${id}?tab=lessons`;
  if (!module || !prefix) return base;
  const first = module.chapters.find((c) => c.title.toLowerCase().startsWith(prefix.toLowerCase()))?.videos[0];
  return first ? `/modules/${id}/lessons/${encodeURIComponent(first.id)}` : base;
}

/** The library, showing one module's files. */
export function libraryLink(moduleId: string): string {
  return `/library?module=${encodeURIComponent(moduleId)}`;
}

/** /forum/new with the title filled in. */
export function askLink(title: string): string {
  return `/forum/new?title=${encodeURIComponent(title)}`;
}

/** What to do about a gap skill for a role: the role's own step for it, else the skill's. */
export function resolveClose(data: CareerDoc, skillId: string, roleId: string): CloseStep | null {
  const role = data.roles.find((r) => r.id === roleId);
  return role?.close[skillId] ?? data.skills[skillId]?.close ?? null;
}
