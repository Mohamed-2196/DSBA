// Where the page is scrolled to when the address changes: Back and Forward return to where each page was left (a long
// list of sittings, a module's files: ST-42), a new page starts at the top, and a change of the query alone (a tab, a
// filter) stays where it is. The positions are kept for this tab, by history entry.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType, type NavigationType } from 'react-router-dom';

export type ScrollAction = { to: 'top' } | { to: 'saved'; y: number } | { to: 'stay' };

/** What to do on arriving at an address. Pure, so it is unit-tested. */
export function scrollAction(
  nav: `${NavigationType}`,
  { samePath, saved }: { samePath: boolean; saved: number | undefined },
): ScrollAction {
  if (nav === 'POP' && saved !== undefined) return { to: 'saved', y: saved };
  if (samePath) return { to: 'stay' };
  return { to: 'top' };
}

const RESTORE_FOR = 2500; // ms: long enough for a lazy page and its cached lists to draw

/** Scroll back to `y` once the page is tall enough (it may still be loading), unless the student scrolls first. */
function restore(y: number): () => void {
  const start = performance.now();
  let frame = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
  };
  const step = () => {
    if (stopped) return;
    const room = document.documentElement.scrollHeight - window.innerHeight;
    if (room >= y || performance.now() - start > RESTORE_FOR) {
      window.scrollTo(0, Math.min(y, Math.max(0, room)));
      if (room >= y) return stop();
    }
    frame = window.requestAnimationFrame(step);
  };
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);
  step();
  return stop;
}

const positions = new Map<string, number>();

export function useScrollMemory(): void {
  const location = useLocation();
  const nav = useNavigationType();
  const keyRef = useRef(location.key);
  const pathRef = useRef<string | null>(null);

  // Remember where each entry is scrolled to.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => positions.set(keyRef.current, window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useLayoutEffect(() => {
    keyRef.current = location.key;
    const samePath = pathRef.current === location.pathname;
    pathRef.current = location.pathname;
    const action = scrollAction(nav, { samePath, saved: positions.get(location.key) });
    if (action.to === 'top') window.scrollTo(0, 0);
    if (action.to === 'saved') return restore(action.y);
    return undefined;
  }, [location.key, location.pathname, nav]);
}
