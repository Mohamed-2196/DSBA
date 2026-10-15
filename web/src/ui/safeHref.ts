// Every URL that comes from the server or from a person (posts, newsletter issues, notifications, search
// results, library links) goes through safeHref() before it reaches `href`, `to`, `src` or window.open.
// Security review (docs/reviews/security-design.md) findings 11 and 12, and SEC-3 (docs/reviews/security.md).

export type SafeHref = { kind: 'internal'; to: string } | { kind: 'external'; href: string };

// Browsers delete tabs and newlines inside a URL ('/\t/evil.example' becomes '//evil.example') and treat a
// backslash as a slash, so none of these may appear anywhere in a link: whitespace (Unicode spaces and the
// zero-width ones included), control characters, and backslashes. Spaces in a real link are written %20.
// eslint-disable-next-line no-control-regex
const SPACE_CONTROL_OR_BACKSLASH = /[\u0000-\u0020\u007f-\u00a0\u00ad\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff\\]/;

// Any origin works: an app path must resolve to the origin it is resolved against, whatever that origin is.
const PROBE_ORIGIN = 'https://hub.invalid';

// The Hub serves its files itself (the Drive import copies the programme's folders into the library), so nothing
// sends a student to Google Drive or Docs: such a link shows as plain text.
const GOOGLE_FILE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

/**
 * internal: a path in this app ('/forum/abc', never '//host', '/\host' or '/\t/host');
 * external: an absolute http(s) or mailto URL, except Google Drive and Docs; anything else (javascript:, data:, relative junk, a link with
 * whitespace, a control character or a backslash in it): null, so render the label as plain text.
 */
export function safeHref(raw: string | null | undefined): SafeHref | null {
  const s = (raw ?? '').trim();
  if (!s || SPACE_CONTROL_OR_BACKSLASH.test(s)) return null;
  if (s.startsWith('/')) {
    if (s.startsWith('//')) return null;
    try {
      return new URL(s, PROBE_ORIGIN).origin === PROBE_ORIGIN ? { kind: 'internal', to: s } : null;
    } catch {
      return null;
    }
  }
  try {
    const u = new URL(s);
    if (GOOGLE_FILE_HOSTS.has(u.hostname.toLowerCase())) return null;
    if (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:') return { kind: 'external', href: u.href };
  } catch {
    /* not a URL */
  }
  return null;
}

/** A path inside the app, or null (for links that must never leave the Hub, like notification targets). */
export function safeInternalPath(raw: string | null | undefined): string | null {
  const h = safeHref(raw);
  return h?.kind === 'internal' ? h.to : null;
}

const MEDIA_PATH = /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True for an uploaded picture's path exactly as the API writes it: '/api/v1/media/<uuid>' (lower case), nothing
 *  before or after it. The one rule for every area that shows uploaded pictures (code quality review CQ-5). */
export function isMediaPath(src: string | null | undefined): src is string {
  return typeof src === 'string' && MEDIA_PATH.test(src);
}
