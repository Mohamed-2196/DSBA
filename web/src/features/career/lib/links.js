// Career Navigator: turn the "close this gap" suggestions into real destinations. Lesson and file links are
// looked up from the module catalogue and the library at run time, so a renamed chapter or file degrades to the
// module page or the library instead of a dead link.
import { getModule } from '../../../data/modules';
import { getFilesForModule } from '../../library/public';
import { getRole } from '../data/roles';
import { SKILLS } from '../data/skills';

/** /modules/<id>?tab=lessons&chapter=<n>, where chapter n is the first whose title starts with `prefix`. */
export function lessonLink(moduleId, prefix) {
  const m = getModule(moduleId);
  if (!m) return '/modules';
  const i = prefix ? m.chapters.findIndex((c) => c.title.toLowerCase().startsWith(prefix.toLowerCase())) : -1;
  return i >= 0 ? `/modules/${m.id}?tab=lessons&chapter=${i}&video=0` : `/modules/${m.id}?tab=lessons`;
}

/** The library viewer for a file, or the module's files when the id is gone. */
export function fileLink(moduleId, fileId) {
  try {
    const f = getFilesForModule(moduleId).find((x) => x.id === fileId);
    if (f) return f.url || `/library/${f.id}`;
  } catch {
    /* fall through */
  }
  return `/library?module=${encodeURIComponent(moduleId)}`;
}

/** /forum/new with the title filled in. */
export function askLink(title) {
  return `/forum/new?title=${encodeURIComponent(title)}`;
}

/**
 * What to do about a gap skill for a role: { kind, text, to? , cert? }.
 *   to:   an in-app route (lesson, file, forum)
 *   cert: a certificate card id to scroll to
 *   kind 'opps' scrolls to the opportunities board
 */
export function resolveClose(skillId, roleId) {
  const skill = SKILLS[skillId];
  const base = skill?.close;
  if (!base) return null;
  const over = getRole(roleId)?.close?.[skillId];
  const c = over ? { ...base, ...over } : base;
  const out = { kind: c.kind, text: c.text };
  if (c.kind === 'lesson') out.to = lessonLink(c.module, c.chapter);
  else if (c.kind === 'file') out.to = fileLink(c.module, c.file);
  else if (c.kind === 'forum') out.to = c.to;
  else if (c.kind === 'cert') out.cert = c.cert;
  return out;
}
