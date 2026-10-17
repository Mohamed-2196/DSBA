import { useLayoutEffect, useState, type RefObject } from 'react';
import type { View } from './layout';

/** The shell's page column (AppShell.tsx): beside the rail, and centred with the shell on very wide screens. */
const COLUMN = '.shell-main';

/**
 * The window right now. `top` and `bottom` are elements whose heights are the room the top bar and the phone tab bar
 * take (see Mascot.css): she keeps between them. Her lanes are at the edges of the page column.
 */
function measure(top: HTMLElement | null, bottom: HTMLElement | null): View {
  const root = document.documentElement;
  const w = root.clientWidth || window.innerWidth;
  let h = root.clientHeight || window.innerHeight;
  // A phone's on-screen keyboard covers the bottom of the page without resizing it; the visual viewport says how
  // much is still in view.
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) < 0.01) h = Math.min(h, Math.round(vv.offsetTop + vv.height));
  const column = document.querySelector(COLUMN)?.getBoundingClientRect();
  return {
    w,
    h,
    ceiling: top ? top.offsetHeight : 0,
    floor: h - (bottom ? bottom.offsetHeight : 0),
    left: column ? Math.max(0, Math.round(column.left)) : 0,
    right: column ? Math.min(w, Math.round(column.right)) : w,
  };
}

const same = (a: View, b: View): boolean => a.w === b.w && a.h === b.h && a.floor === b.floor && a.ceiling === b.ceiling && a.left === b.left && a.right === b.right;

/** The space Mini Noora lives in, kept up to date as the window and the rail change. */
export function useViewport(top: RefObject<HTMLElement>, bottom: RefObject<HTMLElement>): View {
  const [view, setView] = useState<View>(() => measure(null, null));

  useLayoutEffect(() => {
    const update = () => {
      const next = measure(top.current, bottom.current);
      setView((prev) => (same(prev, next) ? prev : next));
    };
    update();
    const vv = window.visualViewport;
    window.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    // The rail folds and unfolds without the window changing size.
    const column = document.querySelector(COLUMN);
    const watch = column && typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (column) watch?.observe(column);
    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      watch?.disconnect();
    };
  }, [top, bottom]);

  return view;
}
