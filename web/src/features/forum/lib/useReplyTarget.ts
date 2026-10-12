import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import type { Reply } from '../../../api/types';
import { prefersReducedMotion } from './motion';

const SETTLE_MS = 4000;

/**
 * The reply a link points at (/forum/<slug>#reply-<id>: a notification, a report, a shared link), scrolled into view
 * once the thread is on screen (student test ST-4). Pictures above it load later and push it down, so it is kept in
 * view while the page settles (a few seconds), until the person scrolls themselves. A reply the thread on screen
 * doesn't have yet (posted a moment ago) makes the thread load again, once. Returns the reply's id, or null.
 */
export function useReplyTarget(replies: readonly Reply[], container: RefObject<HTMLElement>, reload: () => void): string | null {
  const { hash } = useLocation();
  const targetId = hash.startsWith('#reply-') ? hash.slice('#reply-'.length) : null;
  const known = !!targetId && replies.some((r) => r.id === targetId);
  const scrolledTo = useRef<string | null>(null);
  const reloadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!targetId || known || reloadedFor.current === targetId) return;
    reloadedFor.current = targetId;
    reload();
  }, [targetId, known, reload]);

  useEffect(() => {
    if (!targetId || scrolledTo.current === targetId) return undefined;
    const el = document.getElementById(`reply-${targetId}`);
    const main = container.current;
    if (!el || !main) return undefined;
    const smooth = !prefersReducedMotion();
    // In the middle of the screen; a reply taller than most of the screen from its top (under the top bar: the page's
    // scroll-padding), so it is read from the start.
    const place = (animate: boolean) => {
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
      el.scrollIntoView({ behavior: animate && smooth ? 'smooth' : 'auto', block: tall ? 'start' : 'center' });
    };
    // Marked as done only once it has really scrolled (an effect can be set up, torn down and set up again), and
    // after the shell's scroll to the top of a new page (a parent's effect runs after this one).
    const raf = requestAnimationFrame(() => {
      scrolledTo.current = targetId;
      place(true);
    });
    let settling = true;
    const stop = () => {
      settling = false;
    };
    const ro = new ResizeObserver(() => {
      if (settling) place(false);
    });
    ro.observe(main);
    const until = window.setTimeout(stop, SETTLE_MS);
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    for (const ev of events) window.addEventListener(ev, stop, { passive: true, once: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.clearTimeout(until);
      for (const ev of events) window.removeEventListener(ev, stop);
    };
  }, [targetId, replies, container]);

  return targetId;
}
