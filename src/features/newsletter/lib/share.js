// Sharing helpers (no React).

/** Absolute link to a route in this HashRouter app, e.g. issueUrl('/newsletter/launch-edition'). */
export function appUrl(route) {
  if (typeof window === 'undefined') return route;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${route}`;
}

/** Copy text to the clipboard. Resolves true on success (Clipboard API, then a textarea fallback). */
export async function copyText(text) {
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

export const whatsappUrl = (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
export const mailUrl = (subject, url) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(url)}`;
