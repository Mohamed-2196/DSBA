// Every URL that comes from the server or from a person (posts, newsletter issues, notifications, search
// results, library links) goes through safeHref() before it reaches `href`, `to`, `src` or window.open.
// Security review (docs/reviews/security-design.md) findings 11 and 12.

export type SafeHref = { kind: 'internal'; to: string } | { kind: 'external'; href: string };

/**
 * internal: a path in this app ('/forum/abc', never '//host' or '/\host');
 * external: an absolute http(s) or mailto URL; anything else (javascript:, data:, relative junk): null,
 * so render the label as plain text.
 */
export function safeHref(raw: string | null | undefined): SafeHref | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/^\/(?![/\\])/.test(s)) return { kind: 'internal', to: s };
  try {
    const u = new URL(s);
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
