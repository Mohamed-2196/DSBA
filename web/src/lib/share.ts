// Sharing links, the one home for every area (code quality review CQ-5): copying to the clipboard (with a fallback
// for browsers and pages where the Clipboard API is missing or refused), the host a link opens, and the absolute
// address of a page of the Hub.

/**
 * Copy text to the clipboard. Resolves true when it worked: the Clipboard API first, then a hidden text area and
 * the older copy command (an http:// page, an embedded browser, a refused permission). Never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* refused or unavailable: try the fallback */
  }
  if (typeof document === 'undefined') return false;
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * The host a web link opens, without 'www.': 'careers.stc.com.bh' from 'https://www.careers.stc.com.bh/jobs'.
 * Shown beside a button so people can see where it leads. '' when the link isn't an http(s) address.
 */
export function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

/**
 * The absolute address of a page of the Hub, for sharing: appUrl('/newsletter/launch-edition') →
 * 'https://<this origin>/newsletter/launch-edition'. Keeps the app's base path, and the query and hash of `route`.
 */
export function appUrl(route: string, origin: string = window.location.origin): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return new URL(`${base}${route.replace(/^\/+/, '')}`, origin).href;
}
