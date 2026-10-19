// PDFs a note is written over, read with pdf.js (loaded the first time a note on a PDF opens). A library file comes
// from its short-lived link (GET /library/items/{id}/file); the student's own from /notes/files/{id}. The whole file
// is fetched once: the links expire, so nothing is read in ranges later.
import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type * as PdfJsNamespace from 'pdfjs-dist';
import { api, call } from '../../api/client';
import type { NotePdf } from '../../api/types';
import { noteFileHref } from './api';

type PdfJs = typeof PdfJsNamespace;
let pdfjs: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    .then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })
    .catch((e: unknown) => {
      pdfjs = null; // offline: try again next time
      throw e;
    });
  return pdfjs;
}

/** A page's size in PDF points. */
export interface PageSize {
  width: number;
  height: number;
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  pages: PageSize[];
}

async function sourceOf(pdf: NotePdf): Promise<string> {
  if (pdf.libraryItemId) {
    const link = await call(
      api.GET('/api/v1/library/items/{item_id}/file', { params: { path: { item_id: pdf.libraryItemId } } }),
    );
    return link.url;
  }
  return noteFileHref(pdf.uploadId ?? '');
}

async function open(pdf: NotePdf): Promise<LoadedPdf> {
  const [lib, url] = await Promise.all([loadPdfJs(), sourceOf(pdf)]);
  // XFA forms stay off: the page is only ever drawn (pdf.js 6 has no eval path left to turn off). The worker fetches
  // the rest as pages need it: the JBIG2 and JPEG 2000 decoders of scanned papers, character maps, the standard fonts.
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
  const pages: PageSize[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
    pages.push({ width: vp.width, height: vp.height });
  }
  return { doc, pages };
}

export type PdfState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; pdf: LoadedPdf };

/** The note's PDF, opened (null: the note isn't on a PDF). `retry` opens it again after a failure. */
export function usePdf(pdf: NotePdf | null | undefined): { state: PdfState; retry: () => void } {
  const key = pdf?.available ? `${pdf.libraryItemId ?? ''}:${pdf.uploadId ?? ''}` : '';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PdfState>({ status: key ? 'loading' : 'none' });
  useEffect(() => {
    if (!key || !pdf) {
      setState({ status: 'none' });
      return undefined;
    }
    let live = true;
    let loaded: LoadedPdf | null = null;
    setState({ status: 'loading' });
    open(pdf)
      .then((p) => {
        loaded = p;
        if (live) setState({ status: 'ready', pdf: p });
        else void p.doc.loadingTask.destroy();
      })
      .catch(() => {
        if (live) setState({ status: 'error' });
      });
    return () => {
      live = false;
      if (loaded) void loaded.doc.loadingTask.destroy();
    };
    // `pdf` is read through `key`: a new object for the same file opens nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return { state, retry: () => setAttempt((a) => a + 1) };
}
