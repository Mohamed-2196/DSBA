import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { prefersReducedMotion } from './motion';
import { replyTargetId } from './replies';

const SETTLE_MS = 4000;

export interface ReplyTarget {
  /** the reply the link points at, or null */
  id: string | null;
  /** it isn't in the thread, even after reading the thread again: deleted, or hidden by a rep */
  missing: boolean;
}

/**
 * The reply a link points at (/forum/<slug>#reply-<id>: a notification, a report, a shared link), scrolled into view
 * once the thread is on screen (student test ST-4); ReplyItem marks it for a moment. Pictures above it load later and
 * push it down, so it is kept in view while the page settles (a few seconds), until the person scrolls themselves.
 * A reply the page doesn't show yet (posted a moment ago) makes the thread load again, once; if it still isn't
 * there, `missing` says so.
 * @param shown   ids of the replies the page shows (lib/replies.ts shownReplyIds)
 * @param reload  read the thread again
 */
export function useReplyTarget(
  shown: ReadonlySet<string>,
  container: RefObject<HTMLElement>,
  reload: () => Promise<unknown>,
): ReplyTarget {
  const { hash } = useLocation();
  const targetId = replyTargetId(hash);
  const known = !!targetId && shown.has(targetId);
  const scrolledTo = useRef<string | null>(null);
  const reloadedFor = useRef<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId || known || reloadedFor.current === targetId) return;
    reloadedFor.current = targetId;
    void reload().finally(() => setChecked(targetId));
  }, [targetId, known, reload]);

  useEffect(() => {
    if (!targetId || !known || scrolledTo.current === targetId) return undefined;
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
  }, [targetId, known, shown, container]);

  return { id: targetId, missing: !!targetId && !known && checked === targetId };
}
