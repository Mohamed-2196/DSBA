// A PDF drawn by the Hub itself (pdf.js, as the notebook draws it), for phones: their browsers show one page of a
// PDF in a frame, or nothing. Every page at the width of the screen, one under the other, drawn as it comes near;
// pinch to zoom. So a paper reads in the Hub, beside Time me, instead of in another tab (ST-41).
import { ArrowSquareOut, FilePdf } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button, Spinner } from '../../../ui';
import { loadPdfJs } from '../../notes/public';

interface Sized {
  doc: PDFDocumentProxy;
  /** each page's height over its width */
  ratios: number[];
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; pdf: Sized };

async function open(url: string): Promise<Sized> {
  const lib = await loadPdfJs();
  // As the notebook opens them: the whole file once (the link expires), no XFA, the decoders and fonts from our assets.
  const assets = new URL(__PDFJS_ASSETS__, window.location.origin).href;
  const doc = await lib.getDocument({
    url,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    enableXfa: false,
    wasmUrl: `${assets}wasm/`,
    cMapUrl: `${assets}cmaps/`,
    standardFontDataUrl: `${assets}standard_fonts/`,
    iccUrl: `${assets}iccs/`,
  }).promise;
  const ratios: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
    ratios.push(vp.height / vp.width);
  }
  return { doc, ratios };
}

/** One page: a box of the page's shape at once, drawn when it comes within a screen or two. */
function Page({ doc, n, ratio, width }: { doc: PDFDocumentProxy; n: number; ratio: number; width: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);

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

  return (
    <div
      ref={box}
      className="lib-pdf__page"
      style={{ aspectRatio: `1 / ${ratio}` }}
      data-page={n}
      aria-label={`Page ${n}`}
      role="img"
    >
      <canvas ref={canvas} className="lib-pdf__canvas" />
      {!drawn ? <span className="lib-pdf__pageno">{n}</span> : null}
    </div>
  );
}

/** The PDF at `src`, every page; opened at `page` when there is one. `href` opens it in the phone's own viewer. */
export function PdfPages({
  src,
  href,
  title,
  page,
}: {
  src: string;
  href: string;
  title: string;
  page: number | null;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let live = true;
    let opened: Sized | null = null;
    setState({ status: 'loading' });
    open(src)
      .then((pdf) => {
        opened = pdf;
        if (live) setState({ status: 'ready', pdf });
        else void pdf.doc.loadingTask.destroy();
      })
      .catch(() => live && setState({ status: 'error' }));
    return () => {
      live = false;
      if (opened) void opened.doc.loadingTask.destroy();
    };
  }, [src, attempt]);

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
    if (!ready || !page || !width) return;
    frame.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: 'start' });
  }, [ready, page, width]);

  const openOwn = (
    <Button variant="ghost" size="sm" href={href} external leadingIcon={ArrowSquareOut}>
      Open in your PDF viewer
    </Button>
  );

  if (state.status === 'error')
    return (
      <div className="lib-nopreview" data-hub="file-nopreview">
        <FilePdf aria-hidden="true" weight="duotone" className="lib-pdf__erricon" />
        <div className="lib-nopreview__text">
          <h2 className="lib-nopreview__title">The PDF didn’t open here</h2>
          <p>Check your connection and try again, or open it in your phone’s PDF viewer.</p>
          <div className="lib-pdf__actions">
            <Button variant="primary" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </Button>
            {openOwn}
          </div>
        </div>
      </div>
    );
  if (state.status === 'loading')
    return (
      <div className="lib-preview__loading" role="status">
        <Spinner />
        <span>Loading the PDF</span>
      </div>
    );
  const { doc, ratios } = state.pdf;
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
          <Page key={i} doc={doc} n={i + 1} ratio={ratio} width={width} />
        ))}
      </div>
    </div>
  );
}
