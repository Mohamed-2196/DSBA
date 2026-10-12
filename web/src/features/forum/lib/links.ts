// Which URLs user content may point at (docs/reviews/security-design.md, findings 11 and 12; security.md SEC-3).
//   links:  the app's safeHref(): a path inside the app (never '//host', '/\host' or '/\t/host'), or an absolute
//           http:, https: or mailto: URL, with no whitespace, control character or backslash anywhere in it
//   images: only pictures served by the API, exactly /api/v1/media/<uuid> (isMediaPath, the one rule for every area)
import { apiUrl } from '../../../api/client';
import { isMediaPath, safeHref } from '../../../ui/safeHref';

export type SafeLink =
  | { kind: 'internal'; to: string }
  | { kind: 'external'; href: string; host: string }
  | { kind: 'mailto'; href: string };

/** Longer than any real link: a post can't make the page carry a huge URL. */
const MAX_LINK = 2000;

/** The link a markdown `[text](href)` may render, or null (then it stays plain text). */
export function safeLink(raw: string): SafeLink | null {
  const href = raw.trim();
  if (!href || href.length > MAX_LINK) return null;
  const safe = safeHref(href);
  if (!safe) return null;
  if (safe.kind === 'internal') return { kind: 'internal', to: safe.to };
  let url: URL;
  try {
    url = new URL(safe.href);
  } catch {
    return null;
  }
  if (url.protocol === 'mailto:') return { kind: 'mailto', href: url.href };
  if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) {
    return { kind: 'external', href: url.href, host: url.hostname.replace(/^www\./, '') };
  }
  return null;
}

/** The URL to load a forum picture from, or null when the source is not one of ours. */
export function mediaSrc(src: string | null | undefined): string | null {
  return isMediaPath(src) ? apiUrl(src as `/api/v1/${string}`) : null;
}
