// The note's pages, small: the PDF's pages and the paper, each with its free pictures and its handwriting (and the
// typed text on paper), to go to one, and to add, move, clear or delete paper pages. Typed text runs from the first
// page of paper down and keeps the pages it is on: those can't be moved or deleted (pages of handwriting and pictures
// can, and their pictures go with them).
import { ArrowDown, ArrowUp, DotsThree, Eraser, Plus, Trash, X } from '@phosphor-icons/react';
import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import type { Stroke } from '../../api/types';
import { StrokePaths, type InkStroke } from '../../lib/ink';
import { Button, ConfirmDialog, IconButton, Menu, cx, type MenuItem } from '../../ui';
import type { Paper } from './draft';
import type { LoadedPdf } from './pdf';
import { FreePictureView } from './pictures/FreePictureView';
import type { FreePicture } from './pictures/geometry';
import {
  PAPER_BASE,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  TEXT_SIDE,
  TEXT_TOP,
  TEXT_WIDTH,
  type SheetSpec,
} from './surface/layout';

export type PageAction =
  | { kind: 'go'; sheet: number }
  | { kind: 'add' }
  | { kind: 'move'; sheet: number; by: -1 | 1 }
  | { kind: 'clear'; sheet: number }
  | { kind: 'delete'; sheet: number };

/** Thumbnails are this many pixels wide. */
const THUMB = 136;
const SCALE = THUMB / SHEET_WIDTH;

/** One PDF page, drawn small once it scrolls into the drawer. */
const PdfThumb = memo(function PdfThumb({ pdf, page, height }: { pdf: LoadedPdf; page: number; height: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      rootMargin: '200px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !near) return undefined;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let cancelled = false;
    void pdf.doc.getPage(page).then((p) => {
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: (THUMB / base.width) * Math.min(window.devicePixelRatio || 1, 2) });
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      task = p.render({ canvas: el, viewport });
      task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, near]);
  return (
    <canvas
      ref={canvas}
      className="nb-thumb__pdf"
      style={{ width: THUMB, height: height * SCALE }}
      aria-hidden="true"
    />
  );
});

/** The typed text on one page of paper: a copy of the text as it is on screen, shifted to that page. `stamp` changes
 *  when the text did. */
function TextSlice({ text, page, stamp }: { text: HTMLElement | null; page: number; stamp: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !text) return;
    const copy = text.cloneNode(true) as HTMLElement;
    copy.removeAttribute('contenteditable');
    copy.removeAttribute('role');
    copy.removeAttribute('aria-label');
    copy.removeAttribute('data-hub');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    el.replaceChildren(copy);
  }, [text, stamp]);
  return (
    <div
      ref={box}
      className="nb-thumb__text"
      style={{ top: TEXT_TOP - page * SHEET_HEIGHT, left: TEXT_SIDE, width: TEXT_WIDTH }}
    />
  );
}

interface PagesDrawerProps {
  sheets: readonly SheetSpec[];
  pdf: LoadedPdf | null;
  paper: Paper;
  strokesOf: (sheet: number) => readonly Stroke[];
  /** bumps when any sheet's strokes change */
  revision: number;
  /** the pictures free on the pages */
  pictures: readonly FreePicture[];
  /** how many pages of paper the typed text runs onto */
  typedPages: number;
  readOnly: boolean;
  /** where the note's text is (its copy is shown on the paper pages) */
  scrollerRef: RefObject<HTMLDivElement>;
  onAction: (action: PageAction) => void;
  onClose: () => void;
}

export function PagesDrawer({
  sheets,
  pdf,
  paper,
  strokesOf,
  pictures,
  typedPages,
  readOnly,
  scrollerRef,
  onAction,
  onClose,
}: PagesDrawerProps) {
  const [deleting, setDeleting] = useState<number | null>(null);
  // The text copied into the paper pages follows the text a moment after it changes.
  const [text, setText] = useState<HTMLElement | null>(null);
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>('.nb-text') ?? null;
    setText(el);
    if (!el) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const mo = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setStamp((n) => n + 1), 700);
    });
    mo.observe(el, { subtree: true, childList: true, characterData: true, attributes: true });
    return () => {
      mo.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [scrollerRef]);

  const paperCount = sheets.filter((s) => s.kind === 'paper').length;

  return (
    <aside className="nb-pages" aria-label="Pages" data-hub="note-pages-drawer">
      <div className="nb-pages__head">
        <h2 className="nb-pages__title">
          Pages <span>{sheets.length}</span>
        </h2>
        <IconButton icon={X} label="Close pages" size="sm" onClick={onClose} />
      </div>
      <ol className="nb-pages__list">
        {sheets.map((s, i) => {
          const k = s.index - PAPER_BASE;
          const typed = s.kind === 'paper' && k < typedPages;
          const items: MenuItem[] =
            s.kind === 'paper' && !readOnly
              ? [
                  {
                    id: 'up',
                    label: 'Move up',
                    icon: ArrowUp,
                    disabled: typed || k === 0 || k - 1 < typedPages,
                    onSelect: () => onAction({ kind: 'move', sheet: s.index, by: -1 }),
                  },
                  {
                    id: 'down',
                    label: 'Move down',
                    icon: ArrowDown,
                    disabled: typed || k >= paperCount - 1,
                    onSelect: () => onAction({ kind: 'move', sheet: s.index, by: 1 }),
                  },
                  {
                    id: 'clear',
                    label: 'Clear the handwriting',
                    icon: Eraser,
                    disabled: strokesOf(s.index).length === 0,
                    onSelect: () => onAction({ kind: 'clear', sheet: s.index }),
                  },
                  { divider: true },
                  {
                    id: 'delete',
                    label: typed ? 'Delete page (it has typed text)' : 'Delete page',
                    icon: Trash,
                    danger: true,
                    disabled: typed || paperCount <= 1,
                    onSelect: () => setDeleting(s.index),
                  },
                ]
              : [];
          const label = s.kind === 'pdf' ? `PDF page ${s.page ?? i + 1}` : `Page ${k + 1}`;
          return (
            <li key={s.index} className="nb-thumb">
              <button
                type="button"
                className="nb-thumb__open"
                onClick={() => onAction({ kind: 'go', sheet: s.index })}
                aria-label={`Go to ${label.toLowerCase()}`}
              >
                <span className="nb-thumb__sheet" style={{ height: s.height * SCALE }}>
                  {s.kind === 'pdf' && pdf && s.page ? <PdfThumb pdf={pdf} page={s.page} height={s.height} /> : null}
                  <span
                    className={cx('nb-thumb__scaled', s.kind === 'paper' && `nb-paper--${paper}`)}
                    style={{ width: SHEET_WIDTH, height: s.height, transform: `scale(${SCALE})` }}
                  >
                    {typed ? <TextSlice text={text} page={k} stamp={stamp} /> : null}
                    {pictures
                      .filter((p) => p.sheet === s.index)
                      .map((p) => (
                        <FreePictureView key={p.id} p={p} />
                      ))}
                    <svg
                      className="nb-thumb__ink"
                      width={SHEET_WIDTH}
                      height={s.height}
                      viewBox={`0 0 ${SHEET_WIDTH} ${s.height}`}
                      aria-hidden="true"
                    >
                      <StrokePaths strokes={strokesOf(s.index) as readonly InkStroke[]} />
                    </svg>
                  </span>
                </span>
                <span className="nb-thumb__label">{label}</span>
              </button>
              {items.length ? (
                <Menu
                  align="end"
                  label={`${label} options`}
                  items={items}
                  trigger={
                    <IconButton icon={DotsThree} label={`${label} options`} size="sm" className="nb-thumb__more" />
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {readOnly ? null : (
        <div className="nb-pages__foot">
          <Button size="sm" leadingIcon={Plus} onClick={() => onAction({ kind: 'add' })} fullWidth>
            Add a page
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this page?"
        body="Its handwriting and pictures are deleted, and the pages after it move up. You can undo this."
        confirmLabel="Delete page"
        tone="danger"
        onConfirm={() => {
          if (deleting !== null) onAction({ kind: 'delete', sheet: deleting });
          setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      />
    </aside>
  );
}
