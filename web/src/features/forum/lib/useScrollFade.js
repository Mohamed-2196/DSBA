import { useEffect } from 'react';

/**
 * Marks a horizontally scrolling row with data-fade-start / data-fade-end while there is more
 * to scroll, so CSS can fade the cut-off edge (tabs and chips on narrow screens).
 * @param ref       element, or a wrapper when `selector` picks the scroller inside it
 * @param selector  optional CSS selector of the scroller inside `ref`
 * @param key       change it when the row's content changes (re-measures)
 */
export function useScrollFade(ref, selector = null, key = '') {
  useEffect(() => {
    const root = ref.current;
    const el = selector ? root?.querySelector(selector) : root;
    if (!el) return undefined;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = el.scrollWidth - el.clientWidth;
        el.dataset.fadeStart = String(el.scrollLeft > 2);
        el.dataset.fadeEnd = String(max - el.scrollLeft > 2);
      });
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [ref, selector, key]);
}
