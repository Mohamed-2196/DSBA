import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Scroll bookkeeping for the document viewer. Pages all share one size, so the current page and
 * the visible range are plain arithmetic on the scroll position (no observers per page).
 * Works with an internally scrolling canvas (desktop) or the window (mobile).
 *
 * @returns {{ current, first, last, scrollToPage(i, smooth) }}
 */
export function useDocScroll({ canvasRef, pagesRef, count, pageH, gap, pad, internal, stickyOffset = 0, scale }) {
  const [view, setView] = useState({ current: 0, first: 0, last: Math.min(count - 1, 2) });
  const anchor = useRef(null); // { page, frac, line }: what sits on the reading line
  const pitch = pageH + gap;

  const frame = useCallback(() => {
    if (internal) {
      const c = canvasRef.current;
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { top: r.top, height: c.clientHeight, atEnd: c.scrollTop + c.clientHeight >= c.scrollHeight - 2 };
    }
    return { top: stickyOffset, height: window.innerHeight - stickyOffset, atEnd: false };
  }, [internal, canvasRef, stickyOffset]);

  const measure = useCallback(() => {
    const el = pagesRef.current;
    const f = frame();
    if (!el || !f || !pitch) return;
    const top = el.getBoundingClientRect().top + pad;
    const line = f.top + Math.min(f.height * 0.35, 320);
    let current = clamp(Math.floor((line - top) / pitch), 0, count - 1);
    if (f.atEnd) current = count - 1;
    const first = clamp(Math.floor((f.top - top) / pitch), 0, count - 1);
    const last = clamp(Math.floor((f.top + f.height - top) / pitch), 0, count - 1);
    anchor.current = { page: current, frac: clamp((line - top - current * pitch) / pageH, 0, 1), line: line - f.top };
    setView((v) => (v.current === current && v.first === first && v.last === last ? v : { current, first, last }));
  }, [pagesRef, frame, pad, pitch, pageH, count]);

  // Keep the same spot on the reading line when the zoom changes.
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    if (prevScale.current === scale) return;
    prevScale.current = scale;
    const a = anchor.current;
    const el = pagesRef.current;
    if (!a || !el) return;
    const y = pad + a.page * pitch + a.frac * pageH;
    if (internal) {
      const c = canvasRef.current;
      if (c) c.scrollTop = el.offsetTop + y - a.line;
    } else {
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top + y - (stickyOffset + a.line));
    }
  }, [scale, internal, pad, pitch, pageH, canvasRef, pagesRef, stickyOffset]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const c = canvasRef.current;
    if (internal && c) c.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      if (internal && c) c.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [measure, internal, canvasRef]);

  const scrollToPage = useCallback(
    (i, smooth = true) => {
      const el = pagesRef.current;
      if (!el) return;
      const page = clamp(i, 0, count - 1);
      const y = pad + page * pitch;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const behavior = smooth && !reduced ? 'smooth' : 'auto';
      if (internal) {
        canvasRef.current?.scrollTo({ top: el.offsetTop + y - 16, behavior });
      } else {
        window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + y - stickyOffset - 8, behavior });
      }
    },
    [pagesRef, canvasRef, count, pad, pitch, internal, stickyOffset],
  );

  return { ...view, scrollToPage };
}
