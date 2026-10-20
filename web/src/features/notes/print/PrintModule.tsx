// Printing every note of a module as one print, or one PDF from the print dialog (IDEA-53): the night-before
// printout. Each note prints as its own export does (PrintNote): its PDF's pages, its paper with the typed text, the
// formulas, the pictures in the text and free on the pages, and the handwriting over them, each note from a new
// page, oldest first, with its name at the top. Up to MAX_PRINT notes; the rest are said to be left out.
//
// Each note's text is laid out by a read-only editor off screen (formulas and pictures drawn as in the notebook),
// then copied onto the paper pages.
import { EditorContent } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, call } from '../../../api/client';
import type { Note, Stroke } from '../../../api/types';
import { Button, Modal } from '../../../ui';
import { fetchInk, fetchNote } from '../api';
import type { RichDoc } from '../draft';
import { openPdf, sourceOf } from '../pdf';
import { picturesOfDoc } from '../pictures/document';
import { sheetsOf, TEXT_WIDTH, type SheetSpec } from '../surface/layout';
import { useNoteText } from '../text/useNoteText';
import { drawPage } from './drawPage';
import { PrintSheets } from './PrintNote';
import { MAX_PRINT, noteLine, printOrder, progressLine } from './printAll';
import '../Notebook.css';
import './print.css';

/** A picture in a note's text that doesn't load in this long prints without it. */
const PICTURE_WAIT_MS = 8000;

interface Prepared {
  note: Note;
  sheets: SheetSpec[];
  ink: ReadonlyMap<number, Stroke[]>;
  images: Record<number, string>;
}

const noop = () => undefined;

async function prepare(id: string, urls: string[]): Promise<Prepared> {
  const note = await fetchNote(id);
  const ink = new Map<number, Stroke[]>();
  for (const info of note.ink) ink.set(info.sheet, (await fetchInk(id, info.sheet)).strokes);
  const images: Record<number, string> = {};
  let pages: { width: number; height: number }[] = [];
  if (note.pdf?.available) {
    const pdf = await openPdf(await sourceOf(note.pdf));
    try {
      pages = pdf.pages;
      for (let p = 1; p <= pdf.pages.length; p++) {
        const url = await drawPage(pdf, p);
        urls.push(url);
        images[p - 1] = url;
      }
    } finally {
      void pdf.doc.loadingTask.destroy();
    }
  }
  return { note, sheets: sheetsOf(pages, note.sheets), ink, images };
}

const settle = (img: HTMLImageElement) =>
  Promise.race([img.decode().catch(noop), new Promise((resolve) => window.setTimeout(resolve, PICTURE_WAIT_MS))]);

/** A note's typed text laid out off screen at the paper's width; `onReady` gets it once its pictures have loaded. */
function TextSource({ doc, onReady }: { doc: RichDoc; onReady: (text: HTMLElement | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useNoteText({
    doc,
    readOnly: true,
    onChange: noop,
    onReady: noop,
    onFiles: noop,
    onUndo: noop,
    onRedo: noop,
  });
  useEffect(() => {
    if (!editor) return undefined;
    let live = true;
    // the formulas and pictures are drawn by React after the editor: wait a frame for them
    const frame = window.requestAnimationFrame(() => {
      const text = box.current?.querySelector<HTMLElement>('.nb-text') ?? null;
      const pictures = [...(text?.querySelectorAll('img') ?? [])];
      for (const img of pictures) img.loading = 'eager';
      void Promise.all(pictures.map(settle)).then(() => {
        if (live) onReady(text);
      });
    });
    return () => {
      live = false;
      window.cancelAnimationFrame(frame);
    };
  }, [editor, onReady]);
  return (
    <div ref={box} className="nb-print-source" style={{ width: TEXT_WIDTH }} aria-hidden="true">
      {editor ? <EditorContent editor={editor} /> : null}
    </div>
  );
}

export interface PrintModuleProps {
  moduleId: string;
  /** what the PDF is called: 'ST2134 notes' */
  title: string;
  onDone: () => void;
}

export function PrintModule({ moduleId, title, onDone }: PrintModuleProps) {
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [failed, setFailed] = useState(false);
  const [texts, setTexts] = useState<Record<string, HTMLElement | null>>({});
  const root = useRef<HTMLDivElement>(null);

  // The notes, one after the other: their text, ink and PDF pages.
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    void (async () => {
      try {
        const list = await call(
          api.GET('/api/v1/notes', { params: { query: { module_id: moduleId, limit: MAX_PRINT, offset: 0 } } }),
        );
        const order = printOrder(list.items, list.total);
        if (!live) return;
        setCount(order.notes.length);
        setLeft(order.left);
        for (const item of order.notes) {
          const one = await prepare(item.id, urls);
          if (!live) return;
          setPrepared((all) => [...all, one]);
        }
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [moduleId]);

  const onText = useCallback((id: string, text: HTMLElement | null) => setTexts((t) => ({ ...t, [id]: text })), []);
  const ready = count !== null && count > 0 && prepared.length === count && prepared.every((p) => p.note.id in texts);

  // Ready: wait for the pictures on the pages, then print; the dialog's end (or a cancel) ends it.
  useEffect(() => {
    if (!ready || failed) return undefined;
    let live = true;
    const before = document.title;
    const after = () => {
      document.title = before;
      onDone();
    };
    const pictures = [...(root.current?.querySelectorAll('img') ?? [])];
    void Promise.all(pictures.map(settle)).then(() => {
      if (!live) return;
      document.title = title;
      window.addEventListener('afterprint', after, { once: true });
      window.print();
    });
    return () => {
      live = false;
      window.removeEventListener('afterprint', after);
      document.title = before;
    };
  }, [ready, failed, title, onDone]);

  const sources = useMemo(
    () =>
      prepared.map((p) => <TextSource key={p.note.id} doc={p.note.doc} onReady={(text) => onText(p.note.id, text)} />),
    [prepared, onText],
  );

  const empty = count === 0;
  return (
    <>
      <Modal
        open={!ready || failed}
        onClose={onDone}
        title={
          failed ? 'Your notes couldn’t be prepared' : empty ? 'No notes to print' : 'Getting your notes ready to print'
        }
        size="sm"
        footer={<Button onClick={onDone}>{failed || empty ? 'Close' : 'Cancel'}</Button>}
      >
        <p className="nb-print__progress" role="status" data-hub="notes-print-progress">
          {failed
            ? 'Check your connection and try again. Your notes are safe.'
            : empty
              ? 'This module has no notes yet.'
              : count === null
                ? 'Finding your notes.'
                : progressLine(prepared.length, count, left)}
        </p>
      </Modal>
      {createPortal(<div className="nb-print-sources">{sources}</div>, document.body)}
      {ready
        ? createPortal(
            <div ref={root} className="nb-print" aria-hidden="true" data-hub="notes-print">
              {prepared.map((p, i) => (
                <PrintSheets
                  key={p.note.id}
                  sheets={p.sheets}
                  paper={p.note.paper}
                  images={p.images}
                  text={texts[p.note.id] ?? null}
                  strokesOf={(sheet) => p.ink.get(sheet) ?? []}
                  pictures={picturesOfDoc(p.note.doc)}
                  last={i === prepared.length - 1}
                  label={noteLine(p.note)}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
