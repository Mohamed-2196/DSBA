// Motion the person may have turned off: JavaScript scrolls follow prefers-reduced-motion like the CSS does
// (styles/base.css). UX review UX-17.

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** 'smooth', or 'auto' (a jump) when the person asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
