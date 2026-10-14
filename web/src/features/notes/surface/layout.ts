// Where each sheet of a note sits on screen. A note is a column of sheets, all SHEET_WIDTH units wide: its PDF's
// pages first (each its own shape, with a gap between), then its paper (A4 sheets, one after the other, the typed
// text flowing down them). Ink is kept per sheet, in that sheet's units: sheets 0-999 are the PDF's pages, and
// paper sheets count from PAPER_BASE, so a PDF that can't be read never moves the writing on the paper.
export const SHEET_WIDTH = 800;
export const SHEET_HEIGHT = 1131;
export const PAPER_BASE = 1000;
/** Pixels between two PDF pages, and between the PDF and the paper (at any zoom). */
export const PAGE_GAP = 16;
export const PAPER_GAP = 28;
/** The text's line height on paper, in units: ruled paper is ruled at it. */
export const LINE = 32;

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 4;
export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 1000) / 1000));

export interface SheetSpec {
  /** its number in the note (ink is saved by it) */
  index: number;
  kind: 'pdf' | 'paper';
  /** height in units (width is SHEET_WIDTH) */
  height: number;
  /** the PDF's page (1-based) */
  page?: number;
}

/** The note's sheets: a PDF's pages (from their sizes in points) and then `paper` paper sheets. */
export function sheetsOf(pdfPages: readonly { width: number; height: number }[], paper: number): SheetSpec[] {
  const out: SheetSpec[] = pdfPages.map((p, i) => ({ index: i, kind: 'pdf', height: Math.round((SHEET_WIDTH * p.height) / p.width), page: i + 1 }));
  for (let k = 0; k < paper; k++) out.push({ index: PAPER_BASE + k, kind: 'paper', height: SHEET_HEIGHT });
  return out;
}

export interface Placed extends SheetSpec {
  /** top edge in pixels from the top of the column, at the zoom given */
  top: number;
  /** height in pixels */
  px: number;
}

export interface Layout {
  sheets: Placed[];
  /** where the paper begins (pixels), and how tall it is */
  paperTop: number;
  paperHeight: number;
  height: number;
  width: number;
}

export function layoutSheets(sheets: readonly SheetSpec[], zoom: number): Layout {
  const placed: Placed[] = [];
  let y = 0;
  let paperTop = -1;
  let prev: SheetSpec['kind'] | null = null;
  for (const s of sheets) {
    if (prev === 'pdf') y += s.kind === 'pdf' ? PAGE_GAP : PAPER_GAP;
    if (s.kind === 'paper' && paperTop < 0) paperTop = y;
    const px = s.height * zoom;
    placed.push({ ...s, top: y, px });
    y += px;
    prev = s.kind;
  }
  const paperHeight = paperTop < 0 ? 0 : y - paperTop;
  return { sheets: placed, paperTop: paperTop < 0 ? y : paperTop, paperHeight, height: y, width: SHEET_WIDTH * zoom };
}

/** The sheet at a point (pixels in the column), or the nearest one above or below it. */
export function sheetAt(layout: Layout, y: number): Placed | null {
  const { sheets } = layout;
  if (!sheets.length) return null;
  for (const s of sheets) if (y < s.top + s.px) return s;
  return sheets[sheets.length - 1];
}

/** The zoom that fits a sheet's width in `available` pixels (with a margin), within the zoom range. */
export const fitZoom = (available: number, margin = 24): number => clampZoom(Math.min(1.5, (available - margin * 2) / SHEET_WIDTH));
