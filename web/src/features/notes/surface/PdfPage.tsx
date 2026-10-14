// One page of the PDF a note is written over, drawn by pdf.js into a canvas at the zoom on screen (sharp on
// high-density screens) once it scrolls near the view. It draws again, a moment after the zoom changes.
import { memo, useEffect, useRef, useState } from 'react';
import type { LoadedPdf } from '../pdf';

/** The most pixels one page's canvas may hold: tablets refuse bigger canvases. */
const MAX_PIXELS = 6_000_000;

export const PdfPage = memo(function PdfPage({ pdf, page, width, height, root }: { pdf: LoadedPdf; page: number; width: number; height: number; root: HTMLElement | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { root, rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !near) return undefined;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    const timer = setTimeout(() => {
      void pdf.doc.getPage(page).then((p) => {
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        let scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 3);
        const pixels = base.width * base.height * scale * scale;
        if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
        const viewport = p.getViewport({ scale });
        const off = document.createElement('canvas');
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        task = p.render({ canvas: off, viewport });
        task.promise
          .then(() => {
            if (cancelled) return;
            el.width = off.width;
            el.height = off.height;
            el.getContext('2d')?.drawImage(off, 0, 0);
            setDrawn(true);
          })
          .catch(() => undefined);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, page, width, near]);

  return <canvas ref={canvas} className={drawn ? 'nb-pdfpage is-drawn' : 'nb-pdfpage'} style={{ width, height }} aria-hidden="true" />;
});
