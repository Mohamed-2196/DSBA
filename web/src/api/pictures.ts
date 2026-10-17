// Pictures the API stores as paths (newsletter covers and figures, modules' art): a file of the web app's public/
// folder ('modules/module-ec1002.png') or an uploaded image ('/api/v1/media/<id>'). Pictures from other hosts are
// refused: they would log every reader's address. The API's rule is app/core/links.py safe_picture(); this one lets an
// editor see the problem before saving, and keeps anything else out of `src`.
import { isMediaPath } from '../ui/safeHref';
import { API_ORIGIN } from './client';

// A picture file of the app's public/ folder: folders, then an image file name.
const APP_PICTURE = /^\/?(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*\.(?:jpe?g|png|webp|gif|avif|svg)$/i;

/** An uploaded image's path, as a plain test (isMediaPath() narrows its argument). */
const isMedia = (s: string): boolean => isMediaPath(s);

/** True for a picture the API accepts: a file of the app, or an uploaded image ('/api/v1/media/<id>'). */
export function isPicture(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.trim();
  return isMedia(s) || (APP_PICTURE.test(s) && !s.includes('..'));
}

/** Where to load a picture from: the app (under its base path) or the API; null for anything else. */
export function pictureSrc(raw: string | null | undefined): string | null {
  if (!raw || !isPicture(raw)) return null;
  const s = raw.trim();
  if (isMedia(s)) return `${API_ORIGIN}${s}`;
  return `${import.meta.env.BASE_URL}${s.replace(/^\//, '')}`;
}
