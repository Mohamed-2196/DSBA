// Career Navigator: turn the "close this gap" suggestions into real destinations. A lesson link is looked up in the
// module's chapters (from the API) by the chapter's title, so a renamed chapter degrades to the module's lessons
// instead of a dead link. Library files are found through the library itself, filtered by module.
import type { ModuleDetail } from '../../../api/types';
import { readClose } from '../api';
import type { CareerData, CloseStep } from '../types';

/** /modules/<id>?tab=lessons&chapter=<n>&video=0, where chapter n is the first whose title starts with `prefix`. */
export function lessonPath(moduleId: string, prefix: string, module: ModuleDetail | undefined): string {
  const base = `/modules/${encodeURIComponent(moduleId)}?tab=lessons`;
  if (!module || !prefix) return base;
  const i = module.chapters.findIndex((c) => c.title.toLowerCase().startsWith(prefix.toLowerCase()));
  return i >= 0 ? `${base}&chapter=${i}&video=0` : base;
}

/** The library, showing one module's files. */
export function libraryLink(moduleId: string): string {
  return `/library?module=${encodeURIComponent(moduleId)}`;
}

/** /forum/new with the title filled in. */
export function askLink(title: string): string {
  return `/forum/new?title=${encodeURIComponent(title)}`;
}

/** What to do about a gap skill for a role: the skill's own step, with the role's override merged over it. */
export function resolveClose(data: CareerData, skillId: string, roleId: string): CloseStep | null {
  const base = data.skills[skillId]?.close;
  if (!base) return null;
  const over = data.roles.find((r) => r.id === roleId)?.close?.[skillId];
  return over ? (readClose({ ...base, ...over }) ?? base) : base;
}

/** 'careers.stc.com.bh' from a URL: the host a button opens, shown beside it so students can see where it leads. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
