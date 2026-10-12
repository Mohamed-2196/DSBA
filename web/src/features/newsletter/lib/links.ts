// Which links and pictures an issue may carry. Issues are written by student reps, so every URL that reaches href,
// to or src goes through these checks (security review, findings 12 and 18, and SEC-3). The rules mirror the API's
// (api/app/core/links.py), so the editor can say what's wrong before saving; the API checks again either way.
import { API_ORIGIN } from '../../../api/client';
import { isMediaPath } from '../../../ui/safeHref';

// The renderer's rule (ui/safeHref): an app path, or an http(s)/mailto URL; anything else is shown as plain text.
export { safeHref, type SafeHref } from '../../../ui/safeHref';

// Whitespace, control characters and backslashes are never allowed in a link: browsers drop tabs and newlines
// ('/\t/host' becomes '//host') and read '\' as '/'.
// eslint-disable-next-line no-control-regex
const UNSAFE_IN_LINK = /[\u0000-\u0020\u007f\u0085\u2028\u2029\\]/;
/** [label](link) in copy, as the API finds it (an empty label or link still counts). */
const MARKUP_LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g;

/** The longest link the API stores. */
export const MAX_LINK = 2000;

/**
 * What is wrong with a link a rep wrote, as a sentence, or null when it is fine: a page of the Hub ('/calendar', not
 * '//host'), an https:// address without a user name, or a mailto: link.
 */
export function linkProblem(raw: string): string | null {
  const s = raw.trim();
  if (!s) return 'Add a link: a page of the Hub (like /calendar) or an https:// address.';
  if (s.length > MAX_LINK) return `Use a shorter link (at most ${MAX_LINK} characters).`;
  if (UNSAFE_IN_LINK.test(s)) return 'Take out the spaces and backslashes: links can’t have them.';
  if (s.startsWith('/')) return s.startsWith('//') ? 'Start a page of the Hub with one slash, like /calendar.' : null;
  if (/^mailto:/i.test(s)) return s.length > 'mailto:'.length ? null : 'Add the email address after mailto:.';
  if (/^https:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (!u.hostname) return 'Check the address: it has no website in it.';
      if (u.username || u.password) return 'Take the user name and password out of the address.';
      return null;
    } catch {
      return 'Check the address: it isn’t a complete web address.';
    }
  }
  if (/^http:\/\//i.test(s)) return 'Use the page’s https:// address: http:// links aren’t accepted.';
  return 'Use a page of the Hub (like /calendar), an https:// address or a mailto: link.';
}

/** The first link in a piece of copy that the API would refuse, as a sentence, or null. */
export function markupProblem(text: string): string | null {
  for (const m of text.matchAll(MARKUP_LINK)) {
    const href = m[2] ?? '';
    const problem = linkProblem(href);
    if (problem) return href ? `The link “${href}” won’t work. ${problem}` : `A link has no address. ${problem}`;
  }
  return null;
}

// A picture file of the app's public/ folder ('brand/newsletter-cover.jpg'): folders, then an image file name.
const APP_PICTURE = /^\/?(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*\.(?:jpe?g|png|webp|gif|avif|svg)$/i;

/** An uploaded image's path ('/api/v1/media/<id>'), as a plain test (isMediaPath() narrows its argument). */
const isMedia = (s: string): boolean => isMediaPath(s);

/** True for a picture the API accepts: a file of the app, or an uploaded image ('/api/v1/media/<id>'). */
export function isIssuePicture(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.trim();
  return isMedia(s) || (APP_PICTURE.test(s) && !s.includes('..'));
}

/**
 * Where to load a picture from: a file under the app's public/ folder (served under the app's base path) or an
 * uploaded image (/api/v1/media/<id>). Other hosts are refused (they would log every reader's address): null.
 */
export function safeImageSrc(raw: string | null | undefined): string | null {
  if (!raw || !isIssuePicture(raw)) return null;
  const s = raw.trim();
  if (isMedia(s)) return `${API_ORIGIN}${s}`;
  return `${import.meta.env.BASE_URL}${s.replace(/^\//, '')}`;
}

export const whatsappUrl = (text: string, url: string): string => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
export const mailUrl = (subject: string, url: string): string => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(url)}`;
