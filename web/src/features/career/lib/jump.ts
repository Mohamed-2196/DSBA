// Career Navigator: scroll to a part of the page (buttons, not #hash links). The page shows one part at a time, so a
// target in another part asks the page for that part's tab, and the page jumps once the part shows.

import { scrollMotion } from '../../../lib/motion';

/** The id of a part's tab and of its panel. */
export const partTabId = (part: string) => `career-tab-${part}`;
export const partPanelId = (part: string) => `career-part-${part}`;

/** The event that asks Career Navigator to show a part, then jump to an element in it. */
export const SHOW_PART_EVENT = 'career:show-part';

export interface JumpOptions {
  flash?: boolean;
  block?: ScrollLogicalPosition;
}

/** What a SHOW_PART_EVENT carries: the part to show, and what to jump to once it shows. */
export interface ShowPart extends JumpOptions {
  part: string;
  id: string;
}

function scrollTo(el: HTMLElement, flash: boolean, block: ScrollLogicalPosition) {
  el.scrollIntoView({ behavior: scrollMotion(), block });
  if (flash) {
    el.classList.remove('career-flash');
    // Force a reflow so the animation restarts when the same target is chosen twice.
    void el.offsetWidth;
    el.classList.add('career-flash');
    window.setTimeout(() => el.classList.remove('career-flash'), 1800);
  }
}

/**
 * Scroll an element into view by id and, with `flash`, ring it for a moment so the eye finds it. An element in a part
 * that isn't showing brings that part's tab up first. Returns false when there is no such element.
 */
export function jumpTo(id: string, { flash = false, block = 'start' }: JumpOptions = {}): boolean {
  const el = typeof document === 'undefined' ? null : document.getElementById(id);
  if (!el) return false;
  const part = el.closest<HTMLElement>('[data-career-part]');
  if (part?.hidden && part.dataset.careerPart) {
    const detail: ShowPart = { part: part.dataset.careerPart, id, flash, block };
    window.dispatchEvent(new CustomEvent<ShowPart>(SHOW_PART_EVENT, { detail }));
  } else scrollTo(el, flash, block);
  return true;
}

/** The event a skill row sends for a certificate a phone has folded away: Certificates unfolds, then shows it. */
export const SHOW_CERT_EVENT = 'career:show-cert';

/** Scroll to a certificate's card, unfolding the list first when it is folded away (phones). */
export function jumpToCert(certId: string): void {
  if (jumpTo(`career-cert-${certId}`, { flash: true, block: 'center' })) return;
  window.dispatchEvent(new CustomEvent<string>(SHOW_CERT_EVENT, { detail: certId }));
}
