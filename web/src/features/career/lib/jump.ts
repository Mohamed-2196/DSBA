// Career Navigator: scroll to a part of the page (buttons, not #hash links).

const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Scroll an element into view by id and, with `flash`, ring it for a moment so the eye finds it.
 * Returns false when there is no such element.
 */
export function jumpTo(id: string, { flash = false, block = 'start' }: { flash?: boolean; block?: ScrollLogicalPosition } = {}): boolean {
  const el = typeof document === 'undefined' ? null : document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block });
  if (flash) {
    el.classList.remove('career-flash');
    // Force a reflow so the animation restarts when the same target is chosen twice.
    void el.offsetWidth;
    el.classList.add('career-flash');
    window.setTimeout(() => el.classList.remove('career-flash'), 1800);
  }
  return true;
}
