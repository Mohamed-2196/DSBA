// Whether a row that scrolls sideways (a board's columns, the tabs) has more to show past its edges, so they can fade.
import { useCallback, useEffect, useState } from 'react';

export interface ScrollEdges<T extends HTMLElement> {
  /** put on the row, or on what holds it (`pick` finds it inside) */
  ref: (el: T | null) => void;
  start: boolean;
  end: boolean;
}

/** Nothing is watched while `on` is false. */
export function useScrollEdges<T extends HTMLElement>(on = true, pick?: (el: T) => HTMLElement | null): ScrollEdges<T> {
  const [holder, setHolder] = useState<T | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const ref = useCallback((el: T | null) => setHolder(el), []);
  useEffect(() => {
    const el = holder && pick ? pick(holder) : holder;
    if (!el || !on) return undefined;
    const update = () => {
      const start = el.scrollLeft > 2;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of Array.from(el.children)) ro.observe(child);
      update();
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [holder, on, pick]);
  return { ref, start: on && edges.start, end: on && edges.end };
}
