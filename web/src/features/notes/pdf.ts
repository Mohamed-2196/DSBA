// PDFs read with pdf.js (loaded the first time one opens): the ones notes are written over, and the papers the
// library draws on phones (usePdfAt). A note's library file comes from its short-lived link
// (GET /library/items/{id}/file); the student's own from /notes/files/{id}. The whole file is fetched once: the links
// expire, so nothing is read in ranges later.
import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type * as PdfJsNamespace from 'pdfjs-dist';
import { api, call } from '../../api/client';
import type { NotePdf } from '../../api/types';
import { noteFileHref } from './api';

type PdfJs = typeof PdfJsNamespace;
let pdfjs: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
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

/** Where a note's PDF is read from: a library file's short-lived link, or the student's own file. */
export async function sourceOf(pdf: NotePdf): Promise<string> {
  if (pdf.libraryItemId) {
    const link = await call(
      api.GET('/api/v1/library/items/{item_id}/file', { params: { path: { item_id: pdf.libraryItemId } } }),
    );
    return link.url;
  }
  return noteFileHref(pdf.uploadId ?? '');
}

/**
 * Opens the PDF at `url` with every page's size: the one place pdf.js is set up, for the notebook and the library's
 * phone viewer. The whole file is fetched once (the links expire); XFA forms stay off, as the page is only ever drawn
 * (pdf.js 6 has no eval path left to turn off). The worker fetches the rest as pages need it: the JBIG2 and JPEG 2000
 * decoders of scanned papers, character maps, the standard fonts.
 */
export async function openPdf(url: string): Promise<LoadedPdf> {
  const lib = await loadPdfJs();
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

/** The PDF `url()` resolves to, opened while `key` is set (a new key opens it again); `retry` after a failure. */
function useOpenedPdf(key: string, url: () => Promise<string>): { state: PdfState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PdfState>({ status: key ? 'loading' : 'none' });
  useEffect(() => {
    if (!key) {
      setState({ status: 'none' });
      return undefined;
    }
    let live = true;
    let loaded: LoadedPdf | null = null;
    setState({ status: 'loading' });
    url()
      .then(openPdf)
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
    // `url` is read through `key`: a new function for the same file opens nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  return { state, retry: () => setAttempt((a) => a + 1) };
}

/** The note's PDF, opened (null: the note isn't on a PDF). `retry` opens it again after a failure. */
export function usePdf(pdf: NotePdf | null | undefined): { state: PdfState; retry: () => void } {
  const key = pdf?.available ? `${pdf.libraryItemId ?? ''}:${pdf.uploadId ?? ''}` : '';
  return useOpenedPdf(key, () => (pdf ? sourceOf(pdf) : Promise.reject(new Error('No PDF'))));
}

/** The PDF at `src`, opened (as the notebook opens its PDFs). `retry` opens it again after a failure. */
export function usePdfAt(src: string): { state: PdfState; retry: () => void } {
  return useOpenedPdf(src, () => Promise.resolve(src));
}
