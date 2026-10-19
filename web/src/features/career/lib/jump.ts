// Career Navigator: scroll to a part of the page (buttons, not #hash links).

import { scrollMotion } from '../../../lib/motion';

/**
 * Scroll an element into view by id and, with `flash`, ring it for a moment so the eye finds it.
 * Returns false when there is no such element.
 */
export function jumpTo(
  id: string,
  { flash = false, block = 'start' }: { flash?: boolean; block?: ScrollLogicalPosition } = {},
): boolean {
  const el = typeof document === 'undefined' ? null : document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: scrollMotion(), block });
  if (flash) {
    el.classList.remove('career-flash');
    // Force a reflow so the animation restarts when the same target is chosen twice.
    void el.offsetWidth;
    el.classList.add('career-flash');
    window.setTimeout(() => el.classList.remove('career-flash'), 1800);
  }
  return true;
}

/** The event a skill row sends for a certificate a phone has folded away: Certificates unfolds, then shows it. */
export const SHOW_CERT_EVENT = 'career:show-cert';

/** Scroll to a certificate's card, unfolding the list first when it is folded away (phones). */
export function jumpToCert(certId: string): void {
  if (jumpTo(`career-cert-${certId}`, { flash: true, block: 'center' })) return;
  window.dispatchEvent(new CustomEvent<string>(SHOW_CERT_EVENT, { detail: certId }));
}
