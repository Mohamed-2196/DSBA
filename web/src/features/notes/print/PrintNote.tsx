// Printing a note, or saving it as a PDF from the print dialog: every sheet on a page of its own, as it is on screen.
// The PDF's pages are drawn sharp for paper first (with their progress shown), the paper keeps its lines, the typed
// text and the pictures in it sit where they are, the free pictures at their places over them, and the handwriting
// prints over everything as vectors. Nothing of the app prints around it.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Stroke } from '../../../api/types';
import { StrokePaths, type InkStroke } from '../../../lib/ink';
import { Button, Modal, cx } from '../../../ui';
import type { Paper } from '../draft';
import type { LoadedPdf } from '../pdf';
import { FreePictureView } from '../pictures/FreePictureView';
import type { FreePicture } from '../pictures/geometry';
import {
  PAPER_BASE,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  TEXT_SIDE,
  TEXT_TOP,
  TEXT_WIDTH,
  type SheetSpec,
} from '../surface/layout';
import './print.css';

/** A PDF page is drawn this many pixels wide for paper (about 190 dots an inch on A4). */
const PRINT_WIDTH = 1600;
/** A4 is 210 mm wide: 793.7 CSS pixels, so a sheet's 800 units print at this scale. */
const A4_SCALE = 793.7 / SHEET_WIDTH;
/** A4's height in units at that scale: a taller page is scaled down to fit. */
const A4_UNITS = 1131;

interface PrintNoteProps {
  title: string;
  sheets: readonly SheetSpec[];
  paper: Paper;
  pdf: LoadedPdf | null;
  strokesOf: (sheet: number) => readonly Stroke[];
  /** the pictures free on the pages */
  pictures: readonly FreePicture[];
  /** where the note's text is on screen (it is copied onto the paper pages) */
  textSource: RefObject<HTMLElement>;
  onDone: () => void;
}

/** A sheet's ruling, squares or dots as lines and dots of its own: printed sharp (a page's patterned background is
 *  turned into a picture for paper, and its fine lines get lost). */
function PaperRules({ paper, height }: { paper: Paper; height: number }) {
  if (paper === 'blank') return null;
  const rows = Array.from({ length: Math.floor((height - 25) / 32) + 1 }, (_, k) => 25 + 32 * k);
  const cols = Array.from({ length: Math.floor((SHEET_WIDTH - 8) / 32) + 1 }, (_, k) => 8 + 32 * k);
  return (
    <svg className="nb-print__rules" width={SHEET_WIDTH} height={height} viewBox={`0 0 ${SHEET_WIDTH} ${height}`}>
      {paper === 'dotted'
        ? rows.flatMap((y) => cols.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} />))
        : rows.map((y) => <line key={`h${y}`} x1={0} x2={SHEET_WIDTH} y1={y + 0.7} y2={y + 0.7} />)}
      {paper === 'grid' ? cols.map((x) => <line key={`v${x}`} x1={x + 0.6} x2={x + 0.6} y1={0} y2={height} />) : null}
    </svg>
  );
}

/** The typed text on one page of paper: a copy of the text on screen, shifted to that page. */
function PrintText({ source, page }: { source: HTMLElement | null; page: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || !source) return;
    const copy = source.cloneNode(true) as HTMLElement;
    copy.removeAttribute('contenteditable');
    copy.removeAttribute('data-hub');
    el.replaceChildren(copy);
  }, [source, page]);
  return (
    <div
      ref={box}
      className="nb-print__text"
      style={{ top: TEXT_TOP - page * SHEET_HEIGHT, left: TEXT_SIDE, width: TEXT_WIDTH }}
    />
  );
}

async function drawPage(pdf: LoadedPdf, page: number): Promise<string> {
  const p = await pdf.doc.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: PRINT_WIDTH / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await p.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('The page could not be drawn.');
  return URL.createObjectURL(blob);
}

export function PrintNote({ title, sheets, paper, pdf, strokesOf, pictures, textSource, onDone }: PrintNoteProps) {
  const [images, setImages] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pdfPages = sheets.filter((s) => s.kind === 'pdf' && s.page);
  const done = Object.keys(images).length;
  const ready = !pdf || done >= pdfPages.length;
  const text = textSource.current?.querySelector<HTMLElement>('.nb-text') ?? null;

  // The PDF's pages, one after the other.
  useEffect(() => {
    if (!pdf) return undefined;
    let cancelled = false;
    const made: string[] = [];
    void (async () => {
      try {
        for (const s of pdfPages) {
          if (cancelled || !s.page) return;
          const url = await drawPage(pdf, s.page);
          made.push(url);
          if (cancelled) return;
          setImages((m) => ({ ...m, [s.index]: url }));
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      for (const url of made) URL.revokeObjectURL(url);
    };
    // the sheets are fixed for this print
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);

  // Ready: wait for the pictures, then print; the dialog's end (or a cancel) ends it.
  useEffect(() => {
    if (!ready || failed) return undefined;
    let cancelled = false;
    const before = document.title;
    const after = () => {
      document.title = before;
      onDone();
    };
    const pictures = [...(root.current?.querySelectorAll('img') ?? [])];
    void Promise.all(pictures.map((img) => img.decode().catch(() => undefined))).then(() => {
      if (cancelled) return;
      document.title = title;
      window.addEventListener('afterprint', after, { once: true });
      window.print();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', after);
      document.title = before;
    };
  }, [ready, failed, title, onDone]);

  return (
    <>
      <Modal
        open={!ready || failed}
        onClose={onDone}
        title={failed ? 'The PDF’s pages couldn’t be prepared' : 'Getting your note ready to print'}
        size="sm"
        footer={<Button onClick={onDone}>{failed ? 'Close' : 'Cancel'}</Button>}
      >
        <p className="nb-print__progress" role="status">
          {failed
            ? 'Try again in a moment. Your note is safe.'
            : `Preparing the PDF’s pages: ${done} of ${pdfPages.length}.`}
        </p>
      </Modal>
      {createPortal(
        <div ref={root} className="nb-print" aria-hidden="true">
          {sheets.map((s, i) => (
            <section key={s.index} className={cx('nb-print__page', i === sheets.length - 1 && 'is-last')}>
              <div
                className={cx('nb-print__sheet', s.kind === 'paper' && `is-${paper}`)}
                style={{
                  width: SHEET_WIDTH,
                  height: s.height,
                  transform: `scale(${A4_SCALE * Math.min(1, A4_UNITS / s.height)})`,
                  marginLeft: (SHEET_WIDTH * A4_SCALE * (1 - Math.min(1, A4_UNITS / s.height))) / 2,
                }}
              >
                {s.kind === 'pdf' && images[s.index] ? (
                  <img className="nb-print__pdf" src={images[s.index]} alt="" />
                ) : null}
                {s.kind === 'paper' ? <PaperRules paper={paper} height={s.height} /> : null}
                {s.kind === 'paper' ? <PrintText source={text} page={s.index - PAPER_BASE} /> : null}
                {pictures
                  .filter((p) => p.sheet === s.index)
                  .map((p) => (
                    <FreePictureView key={p.id} p={p} />
                  ))}
                <svg
                  className="nb-print__ink"
                  width={SHEET_WIDTH}
                  height={s.height}
                  viewBox={`0 0 ${SHEET_WIDTH} ${s.height}`}
                >
                  <StrokePaths strokes={strokesOf(s.index) as readonly InkStroke[]} />
                </svg>
              </div>
            </section>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
