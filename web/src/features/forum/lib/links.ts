// Which URLs user content may point at (docs/reviews/security-design.md, findings 11 and 12).
//   links:  the app's safeHref() (a path inside the app, never '//host' or '/\host'; or an absolute http:, https: or
//           mailto: URL), plus one more rule here: no whitespace or control characters anywhere, because URL parsers
//           drop tabs and newlines ('/\t/host' would become '//host')
//   images: only forum pictures served by the API, exactly /api/v1/media/<uuid>
import { apiUrl } from '../../../api/client';
import { safeHref } from '../../../ui/safeHref';

export type SafeLink =
  | { kind: 'internal'; to: string }
  | { kind: 'external'; href: string; host: string }
  | { kind: 'mailto'; href: string };

// eslint-disable-next-line no-control-regex
const SPACE_OR_CONTROL = /[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff\\]/;
const MEDIA = /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The link a markdown `[text](href)` may render, or null (then it stays plain text). */
export function safeLink(raw: string): SafeLink | null {
  const href = raw.trim();
  if (!href || href.length > 2000 || SPACE_OR_CONTROL.test(href)) return null;
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

/** True for '/api/v1/media/<uuid>' (lower-case, as the API writes it), and nothing else. */
export function isMediaPath(src: string | null | undefined): src is string {
  return typeof src === 'string' && MEDIA.test(src);
}

/** The URL to load a forum picture from, or null when the source is not one of ours. */
export function mediaSrc(src: string | null | undefined): string | null {
  return isMediaPath(src) ? apiUrl(src as `/api/v1/${string}`) : null;
}
