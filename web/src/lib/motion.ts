// Motion the person may have turned off: scrolls made from code follow prefers-reduced-motion, as the CSS does
// (styles/base.css). Use it as `el.scrollIntoView({ behavior: scrollMotion() })`.
export function scrollMotion(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}
