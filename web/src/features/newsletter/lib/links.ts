// Which links and pictures an issue may carry. Issues are written by student reps, so every URL that
// reaches href, to or src goes through these checks (security review, findings 12 and 18).
import { API_ORIGIN } from '../../../api/client';

// The renderer's rule (ui/safeHref): an app path, or an http(s)/mailto URL; anything else is shown as plain text.
export { safeHref, type SafeHref } from '../../../ui';

/**
 * Why the API would refuse a link written into an issue, or null when it is fine (security review, finding 18):
 * a page of the Hub ('/calendar', not '//host'), an https:// address or a mailto: link. The reader is more
 * lenient (old http:// links still work there), but nothing new is saved with them.
 */
export function linkProblem(raw: string): string | null {
  const s = raw.trim();
  if (/^\/(?![/\\])/.test(s) || /^mailto:\S/i.test(s)) return null;
  if (/^https:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.username || u.password) return 'can’t carry a user name or password.';
      return s.includes('\\') ? 'has a backslash in it: check the address.' : null;
    } catch {
      return 'isn’t a complete web address.';
    }
  }
  if (/^http:\/\//i.test(s)) return 'starts with http://, which isn’t accepted: use the page’s https:// address.';
  return 'must be a page of the Hub (like /calendar), an https:// address or a mailto: link.';
}

const MEDIA_RE = /^\/api\/v1\/media\/[0-9a-f-]{36}$/;
const PUBLIC_RE = /^\/?[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_.-]*)*$/i;

/**
 * Where a picture may come from: a file under the app's public/ folder ('demo/news/x.jpg', served under the
 * app's base path) or an uploaded image ('/api/v1/media/<id>'). Other hosts are refused (they would log
 * every reader's address): null.
 */
export function safeImageSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (MEDIA_RE.test(s)) return `${API_ORIGIN}${s}`;
  if (PUBLIC_RE.test(s) && !s.includes('..')) return `${import.meta.env.BASE_URL}${s.replace(/^\//, '')}`;
  return null;
}

/** Absolute link to a route of the app, e.g. appUrl('/newsletter/launch-edition'). */
export function appUrl(route: string): string {
  return new URL(`${import.meta.env.BASE_URL}${route.replace(/^\//, '')}`, window.location.origin).href;
}

/** Copy text to the clipboard. Resolves true on success (Clipboard API, then a textarea fallback). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export const whatsappUrl = (text: string, url: string): string => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
export const mailUrl = (subject: string, url: string): string => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(url)}`;
