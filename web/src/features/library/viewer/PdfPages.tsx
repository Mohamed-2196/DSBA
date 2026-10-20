// A PDF drawn by the Hub itself (pdf.js, as the notebook draws it), for phones: their browsers show one page of a
// PDF in a frame, or nothing. Every page at the width of the screen, one under the other, drawn as it comes near;
// pinch to zoom. So a paper reads in the Hub, beside Time me, instead of in another tab (ST-41). Opened at a tagged
// question, it marks where the question starts on its page (anchor.ts), on any screen.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button, Spinner, cx, glyph, Icon } from '../../../ui';
import { usePdfAt } from '../../notes/public';
import { bandOf, findAnchor, type Box } from './anchor';

/** The share of a page's height the name above a band needs; a band nearer the top has its name inside. */
const LABEL_ROOM = 0.04;

/** A question to mark: its page, its first words when known, and its name ('Q3', 'B1'). */
export interface QuestionMark {
  page: number;
  anchor: string | null;
  name: string;
}

/** Where the question starts on its page (a band across it), or the whole page when its words aren't found there. */
async function locate(doc: PDFDocumentProxy, mark: QuestionMark): Promise<Box | 'page'> {
  if (!mark.anchor) return 'page';
  const page = await doc.getPage(mark.page);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items.flatMap((i) => ('str' in i ? [i] : []));
  const hit = findAnchor(
    items.map((i) => i.str),
    mark.anchor,
  );
  if (!hit) return 'page';
  const lines = items.slice(hit.first, hit.last + 1).map((i) => {
    const [, , c, d, x, y] = i.transform as number[];
    const size = Math.hypot(c, d) || i.height;
    const [, baseline] = viewport.convertToViewportPoint(x, y);
    return { top: (baseline - size) / viewport.height, bottom: (baseline + size * 0.2) / viewport.height };
  });
  return bandOf(lines) ?? 'page';
}

/** One page: a box of the page's shape at once, drawn when it comes within a screen or two. */
function Page({
  doc,
  n,
  ratio,
  width,
  mark,
}: {
  doc: PDFDocumentProxy;
  n: number;
  ratio: number;
  width: number;
  /** the question that starts on this page, to mark */
  mark: QuestionMark | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);
  // Where `mark` starts, kept with the mark it is for: another question on this page starts over.
  const [located, setLocated] = useState<{ mark: QuestionMark; at: Box | 'page' } | null>(null);
  const found = mark && located?.mark === mark ? located.at : null;

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      rootMargin: '150% 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !width || !canvas.current) return undefined;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void doc.getPage(n).then((page) => {
      const c = canvas.current;
      if (cancelled || !c) return;
      const scale = (width / page.getViewport({ scale: 1 }).width) * Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = page.getViewport({ scale });
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      const render = page.render({ canvas: c, viewport });
      task = render;
      render.promise.then(
        () => !cancelled && setDrawn(true),
        () => undefined, // cancelled, or the page couldn't be drawn: the box stays
      );
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, width, doc, n]);

  // Once the page is drawn, find the question's words on it; then bring the mark into view and move focus to it.
  useEffect(() => {
    if (!drawn || !mark) return undefined;
    let cancelled = false;
    locate(doc, mark).then(
      (at) => !cancelled && setLocated({ mark, at }),
      () => !cancelled && setLocated({ mark, at: 'page' }),
    );
    return () => {
      cancelled = true;
    };
  }, [drawn, doc, mark]);

  useEffect(() => {
    if (!found) return;
    marker.current?.scrollIntoView({ block: found === 'page' ? 'start' : 'center' });
    marker.current?.focus({ preventScroll: true });
  }, [found]);

  const label = mark ? `${mark.name} starts here` : '';
  return (
    <div
      ref={box}
      className={cx('lib-pdf__page', found === 'page' && 'is-marked')}
      style={{ aspectRatio: `1 / ${ratio}` }}
      data-page={n}
    >
      <canvas ref={canvas} className="lib-pdf__canvas" role="img" aria-label={`Page ${n}`} />
      {!drawn ? <span className="lib-pdf__pageno">{n}</span> : null}
      {mark && found ? (
        <div
          ref={marker}
          className={cx(
            'lib-pdf__mark',
            found === 'page' ? 'lib-pdf__mark--page' : found.top < LABEL_ROOM && 'lib-pdf__mark--top',
          )}
          style={
            found === 'page'
              ? undefined
              : { top: `${found.top * 100}%`, height: `${(found.bottom - found.top) * 100}%` }
          }
          tabIndex={-1}
          role="note"
          aria-label={found === 'page' ? `${mark.name} is on page ${n}` : `${label}, page ${n}`}
          data-hub="question-mark"
        >
          <span className="lib-pdf__marklabel" aria-hidden="true">
            {found === 'page' ? `${mark.name} is on this page` : label}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** The PDF at `src`, every page; opened at `page` when there is one, and at `mark`'s question, marked, when there is
 *  one. `href` opens it in the device's own viewer. */
export function PdfPages({
  src,
  href,
  title,
  page,
  mark = null,
}: {
  src: string;
  href: string;
  title: string;
  page: number | null;
  mark?: QuestionMark | null;
}) {
  const { state, retry } = usePdfAt(src);
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const ratios = useMemo(
    () => (state.status === 'ready' ? state.pdf.pages.map((p) => p.height / p.width) : []),
    [state],
  );

  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.status]);

  // Opened at a page (a search hit, a tagged question): go there once the pages have their shapes.
  const ready = state.status === 'ready';
  useEffect(() => {
    const at = mark?.page ?? page;
    if (!ready || !at || !width) return;
    frame.current?.querySelector(`[data-page="${at}"]`)?.scrollIntoView({ block: 'start' });
  }, [ready, page, mark?.page, width]);

  const openOwn = (
    <Button variant="ghost" size="sm" href={href} external leadingIcon={<Icon glyph={glyph.external} />}>
      Open in your PDF viewer
    </Button>
  );

  if (state.status === 'error')
    return (
      <div className="lib-nopreview" data-hub="file-nopreview">
        <Icon glyph={glyph.filePdf} aria-hidden="true" className="lib-pdf__erricon" />
        <div className="lib-nopreview__text">
          <h2 className="lib-nopreview__title">The PDF didn’t open here</h2>
          <p>Check your connection and try again, or open it in your phone’s PDF viewer.</p>
          <div className="lib-pdf__actions">
            <Button variant="primary" onClick={retry}>
              Try again
            </Button>
            {openOwn}
          </div>
        </div>
      </div>
    );
  if (state.status !== 'ready')
    return (
      <div className="lib-preview__loading" role="status">
        <Spinner />
        <span>Loading the PDF</span>
      </div>
    );
  const { doc } = state.pdf;
  return (
    <div className="lib-pdf" data-hub="file-pdf-pages">
      <div className="lib-pdf__bar">
        <span className="lib-pdf__count">
          {ratios.length} {ratios.length === 1 ? 'page' : 'pages'}
        </span>
        {openOwn}
      </div>
      <div ref={frame} className="lib-pdf__pages" aria-label={`${title}, the PDF`} role="document">
        {ratios.map((ratio, i) => (
          <Page key={i} doc={doc} n={i + 1} ratio={ratio} width={width} mark={mark?.page === i + 1 ? mark : null} />
        ))}
      </div>
    </div>
  );
}
