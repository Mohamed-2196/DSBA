import { useLayoutEffect, useState, type RefObject } from 'react';

/** The window: { w, h }, and `floor`, the line she may not stand below (the top of the phone tab bar). */
export interface View {
  w: number;
  h: number;
  floor: number;
}

/** The window right now. `ruler` is an element whose height is the space the phone tab bar takes (see Mascot.css). */
function measure(ruler: HTMLElement | null): View {
  const root = document.documentElement;
  const w = root.clientWidth || window.innerWidth;
  let h = root.clientHeight || window.innerHeight;
  // A phone's on-screen keyboard covers the bottom of the page without resizing it;
  // the visual viewport says how much is still in view.
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) < 0.01) h = Math.min(h, Math.round(vv.offsetTop + vv.height));
  return { w, h, floor: h - (ruler ? ruler.offsetHeight : 0) };
}

/** The space Mini Noora lives in, kept up to date as the window changes. */
export function useViewport(rulerRef: RefObject<HTMLElement>): View {
  const [view, setView] = useState<View>(() => measure(null));

  useLayoutEffect(() => {
    const update = () => {
      const next = measure(rulerRef.current);
      setView((prev) => (prev.w === next.w && prev.h === next.h && prev.floor === next.floor ? prev : next));
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
  }, [rulerRef]);

  return view;
}
