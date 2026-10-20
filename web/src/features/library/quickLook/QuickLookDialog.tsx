// Quick Look's dialog: a file's first pages without leaving the list, as Quick Look shows them on a Mac. Space or Esc
// closes it, and the arrow keys move to the file before or after (useQuickLook.tsx opens it).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useModules } from '../../../state/modules';
import { Button, Icon, IconButton, Modal, Spinner, glyph } from '../../../ui';
import { usePdfAt } from '../../notes/public';
import { downloadHref, itemPath, openLinkHref, useFileLink } from '../api';
import { FileThumb } from '../components/FileThumb';
import { examTitle, linkPlace, moduleTag, sizeLabel } from '../display';
import { formatOf, kindLabel, previewKind } from '../kinds';
import type { LibraryItem } from '../types';
import { QUICK_PAGES, focusedOf, ownsSpace, placeOf, stepFrom } from './rules';
import './QuickLook.css';

function Loading({ label }: { label: string }) {
  return (
    <div className="lib-ql__state" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/** One page, drawn at `width` CSS pixels. */
function QuickPage({ doc, n, ratio, width }: { doc: PDFDocumentProxy; n: number; ratio: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!width || !canvas.current) return undefined;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void doc.getPage(n).then((page) => {
      const c = canvas.current;
      if (cancelled || !c) return;
      const scale = (width / page.getViewport({ scale: 1 }).width) * Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale });
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      const render = page.render({ canvas: c, viewport });
      task = render;
      render.promise.then(
        () => !cancelled && setDrawn(true),
        () => undefined, // cancelled, or the page couldn't be drawn: its sheet stays
      );
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, n, width]);
  return (
    <div className="lib-ql__page" style={{ width, aspectRatio: `1 / ${ratio}` }} role="img" aria-label={`Page ${n}`}>
      <canvas ref={canvas} className="lib-ql__canvas" />
      {!drawn ? <span className="lib-ql__pageno">{n}</span> : null}
    </div>
  );
}

const PAD = 32; // the preview's padding, both sides
const A4 = Math.SQRT2; // a page's height over its width, until the PDF says

/** The PDF's first pages, each as wide as fits the preview's height, from the file's short-lived link. */
function FirstPages({ item }: { item: LibraryItem }) {
  const link = useFileLink(item.id);
  // The first link is kept: a refreshed one would open the PDF again.
  const [src, setSrc] = useState<string | null>(null);
  if (!src && link.data) setSrc(link.data.url);
  const { state, retry } = usePdfAt(src ?? '');
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = area.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) =>
      setBox({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Each page as wide as the space allows, and no taller than the preview: the first page shows whole.
  const widthFor = (ratio: number) =>
    Math.max(0, Math.floor(Math.min(box.width - PAD, (box.height - PAD) / ratio, 900)));
  let content: ReactNode;
  if (link.isError && !src) {
    content = (
      <div className="lib-ql__state">
        <p>The preview didn’t load. Check your connection and try again.</p>
        <Button size="sm" onClick={() => void link.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (state.status === 'error') {
    content = (
      <div className="lib-ql__state">
        <p>The PDF didn’t open here. Try again, or open the file.</p>
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  } else if (state.status !== 'ready') {
    const label = link.isPaused ? 'You’re offline. The preview shows once you’re back online.' : 'Loading the PDF';
    // The cover is the first page already: it stands in while the PDF loads.
    content = item.coverUrl ? (
      <div className="lib-ql__page" style={{ width: widthFor(A4) || undefined, aspectRatio: `1 / ${A4}` }}>
        <img className="lib-ql__canvas" src={item.coverUrl} alt="" referrerPolicy="no-referrer" />
        <span className="lib-ql__waiting" role="status">
          <Spinner />
          <span className="visually-hidden">{label}</span>
        </span>
      </div>
    ) : (
      <Loading label={label} />
    );
  } else {
    const pages = state.pdf.pages.slice(0, QUICK_PAGES);
    const total = state.pdf.pages.length;
    content = (
      <>
        {pages.map((p, i) => (
          <QuickPage
            key={i}
            doc={state.pdf.doc}
            n={i + 1}
            ratio={p.height / p.width}
            width={widthFor(p.height / p.width)}
          />
        ))}
        <p className="lib-ql__more">
          {total > QUICK_PAGES
            ? `The first ${QUICK_PAGES} of ${total} pages. Open the file to read on.`
            : `${total} ${total === 1 ? 'page' : 'pages'}.`}
        </p>
      </>
    );
  }
  return (
    <div ref={area} className="lib-ql__area" data-hub="quick-look-pages">
      {content}
    </div>
  );
}

function QuickImage({ item }: { item: LibraryItem }) {
  const link = useFileLink(item.id);
  const [src, setSrc] = useState<string | null>(null);
  if (!src && link.data) setSrc(link.data.url);
  return (
    <div className="lib-ql__area lib-ql__area--image">
      {src ? (
        <img className="lib-ql__image" src={src} alt={item.description || item.title} referrerPolicy="no-referrer" />
      ) : link.isError ? (
        <div className="lib-ql__state">
          <p>The picture didn’t load. Check your connection and try again.</p>
          <Button size="sm" onClick={() => void link.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <Loading label="Loading the picture" />
      )}
    </div>
  );
}

/** Links and files the browser can't show: the cover, and where it opens. */
function NoQuickLook({ item }: { item: LibraryItem }) {
  const fmt = formatOf(item);
  return (
    <div className="lib-ql__area lib-ql__area--none">
      <FileThumb item={item} size="grid" className="lib-ql__thumb" />
      <p className="lib-ql__note">
        {item.source === 'link'
          ? `Kept on ${linkPlace(item)}. Open it there to read it.`
          : `No preview for ${fmt ? `${fmt.name}s` : 'this file'}. Download it to open it.`}
      </p>
    </div>
  );
}

function Body({ item }: { item: LibraryItem }) {
  const kind = item.status === 'removed' ? null : previewKind(item);
  if (kind === 'pdf') return <FirstPages item={item} />;
  if (kind === 'image') return <QuickImage item={item} />;
  return <NoQuickLook item={item} />;
}

export function QuickLookDialog({
  open,
  item,
  items,
  onMove,
  onClose,
}: {
  open: boolean;
  item: LibraryItem;
  items: readonly LibraryItem[];
  onMove: (id: string) => void;
  onClose: () => void;
}) {
  const { getModule } = useModules();
  const code = moduleTag(getModule(item.moduleId));
  const name = examTitle(item, code);
  const prev = stepFrom(items, item.id, -1);
  const next = stepFrom(items, item.id, 1);
  const place = placeOf(items, item.id);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || !(e.target instanceof Element)) return;
    const target = e.target;
    if (e.key === ' ') {
      // Space presses a focused button or link; anywhere else it closes, as it opened.
      if (ownsSpace(focusedOf(target)) || target.tagName === 'A') return;
      e.preventDefault();
      onClose();
      return;
    }
    const step =
      e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        ? prev
        : e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? next
          : null;
    if (step) {
      e.preventDefault();
      onMove(step.id);
    }
  };
  // A button that turns off at the end of the list would drop focus out of the dialog: the dialog takes it instead.
  const move = (id: string, delta: number, from: HTMLElement) => {
    onMove(id);
    if (!stepFrom(items, id, delta)) from.closest<HTMLElement>('[role="dialog"]')?.focus();
  };
  const meta = [kindLabel(item.kind), code, sizeLabel(item)].filter(Boolean).join(' · ');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={name}
      description={meta}
      size="lg"
      className="lib-ql"
      bodyClassName="lib-ql__body"
      onKeyDown={onKeyDown}
      data-hub="quick-look"
      footer={
        <>
          {items.length > 1 ? (
            <span className="lib-ql__nav">
              <IconButton
                label="Previous file"
                icon={<Icon glyph={glyph.chevronLeft} />}
                size="sm"
                variant="secondary"
                disabled={!prev}
                onClick={(e) => prev && move(prev.id, -1, e.currentTarget)}
              />
              <IconButton
                label="Next file"
                icon={<Icon glyph={glyph.chevronRight} />}
                size="sm"
                variant="secondary"
                disabled={!next}
                onClick={(e) => next && move(next.id, 1, e.currentTarget)}
              />
              {place ? <span className="lib-ql__place u-tabular">{place}</span> : null}
            </span>
          ) : null}
          <span className="lib-ql__hint" aria-hidden="true">
            Space or Esc closes. Arrow keys move between files.
          </span>
          <span className="lib-ql__actions">
            {item.source === 'link' ? (
              <Button size="sm" href={openLinkHref(item)} trailingIcon={<Icon glyph={glyph.external} />}>
                Open on {linkPlace(item)}
              </Button>
            ) : item.status !== 'removed' ? (
              <Button size="sm" href={downloadHref(item)} leadingIcon={<Icon glyph={glyph.download} />}>
                Download
              </Button>
            ) : null}
            <Button size="sm" variant="primary" to={itemPath(item)}>
              Open
            </Button>
          </span>
        </>
      }
    >
      <Body key={item.id} item={item} />
    </Modal>
  );
}
