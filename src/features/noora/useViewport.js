import { useLayoutEffect, useState } from 'react';

/** The window right now. `ruler` is an element whose height is the space the phone tab bar takes (see Mascot.css). */
function measure(ruler) {
  const root = document.documentElement;
  const w = root.clientWidth || window.innerWidth;
  let h = root.clientHeight || window.innerHeight;
  // A phone's on-screen keyboard covers the bottom of the page without resizing it;
  // the visual viewport says how much is still in view.
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) < 0.01) h = Math.min(h, Math.round(vv.offsetTop + vv.height));
  return { w, h, floor: h - (ruler ? ruler.offsetHeight : 0) };
}

/**
 * The space Mini Noora lives in, kept up to date as the window changes:
 * { w, h } the window, and `floor`, the line she may not stand below (the top of the phone tab bar).
 */
export function useViewport(rulerRef) {
  const [view, setView] = useState(() => measure(null));

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
