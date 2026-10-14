import { useLayoutEffect, useState, type RefObject } from 'react';
import type { View } from './layout';

/**
 * The window right now. `top` and `bottom` are elements whose heights are the room the top bar and the phone tab bar
 * take (see Mascot.css): she keeps between them.
 */
function measure(top: HTMLElement | null, bottom: HTMLElement | null): View {
  const root = document.documentElement;
  const w = root.clientWidth || window.innerWidth;
  let h = root.clientHeight || window.innerHeight;
  // A phone's on-screen keyboard covers the bottom of the page without resizing it; the visual viewport says how
  // much is still in view.
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) < 0.01) h = Math.min(h, Math.round(vv.offsetTop + vv.height));
  return { w, h, ceiling: top ? top.offsetHeight : 0, floor: h - (bottom ? bottom.offsetHeight : 0) };
}

/** The space Mini Noora lives in, kept up to date as the window changes. */
export function useViewport(top: RefObject<HTMLElement>, bottom: RefObject<HTMLElement>): View {
  const [view, setView] = useState<View>(() => measure(null, null));

  useLayoutEffect(() => {
    const update = () => {
      const next = measure(top.current, bottom.current);
      setView((prev) => (prev.w === next.w && prev.h === next.h && prev.floor === next.floor && prev.ceiling === next.ceiling ? prev : next));
    };
    update();
    const vv = window.visualViewport;
    window.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [top, bottom]);

  return view;
}
