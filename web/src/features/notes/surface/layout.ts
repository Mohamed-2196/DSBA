// Where each sheet of a note sits, in sheet units. A note is a column of sheets, all SHEET_WIDTH units wide: its
// PDF's pages first (each its own shape, with a gap between), then its paper (sheets of PAPER_LINES ruled lines, one
// after the other, the typed text flowing down them). Ink is kept per sheet, in that sheet's units: sheets 0-999 are
// the PDF's pages, and paper sheets count from PAPER_BASE, so a PDF that can't be read never moves the writing on the
// paper.
//
// Everything on the page is laid out in units and the whole column is scaled for the zoom, so the typed text wraps the
// same way at every zoom and on every device: handwriting next to a word stays next to it.
export const SHEET_WIDTH = 800;
/** The text's line height, in units: ruled paper is ruled at it, and every block of text keeps to it. */
export const LINE = 32;
/** Ruled lines on one sheet of paper: a page break always falls between two lines of text. */
export const PAPER_LINES = 35;
/** A sheet of paper: A4's shape, rounded to whole lines (A4 itself is 1131 units). */
export const SHEET_HEIGHT = LINE * PAPER_LINES;
export const PAPER_BASE = 1000;
/** Units between two PDF pages, and between the PDF and the paper. */
export const PAGE_GAP = 24;

/** Where the typed text sits on the paper: two lines down, inside side margins. */
export const TEXT_TOP = 2 * LINE;
export const TEXT_SIDE = 72;
export const TEXT_WIDTH = SHEET_WIDTH - 2 * TEXT_SIDE;

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
  const out: SheetSpec[] = pdfPages.map((p, i) => ({
    index: i,
    kind: 'pdf',
    height: Math.round((SHEET_WIDTH * p.height) / p.width),
    page: i + 1,
  }));
  for (let k = 0; k < paper; k++) out.push({ index: PAPER_BASE + k, kind: 'paper', height: SHEET_HEIGHT });
  return out;
}

export interface Placed extends SheetSpec {
  /** top edge in units from the top of the column */
  top: number;
}

export interface Layout {
  sheets: Placed[];
  /** where the paper begins, and how tall it is (units) */
  paperTop: number;
  paperHeight: number;
  /** the whole column (units) */
  height: number;
}

export function layoutSheets(sheets: readonly SheetSpec[]): Layout {
  const placed: Placed[] = [];
  let y = 0;
  let paperTop = -1;
  let prev: SheetSpec['kind'] | null = null;
  for (const s of sheets) {
    if (prev === 'pdf') y += PAGE_GAP;
    if (s.kind === 'paper' && paperTop < 0) paperTop = y;
    placed.push({ ...s, top: y });
    y += s.height;
    prev = s.kind;
  }
  const paperHeight = paperTop < 0 ? 0 : y - paperTop;
  return { sheets: placed, paperTop: paperTop < 0 ? y : paperTop, paperHeight, height: y };
}

/** The sheet at a height in the column (units), or the nearest one above or below it. */
export function sheetAt(layout: Layout, y: number): Placed | null {
  const { sheets } = layout;
  if (!sheets.length) return null;
  for (const s of sheets) if (y < s.top + s.height) return s;
  return sheets[sheets.length - 1];
}

/** The zoom that fits a sheet's width in `available` pixels (with a margin), within the zoom range. */
export const fitZoom = (available: number, margin = 24): number =>
  clampZoom(Math.min(1.5, (available - margin * 2) / SHEET_WIDTH));

/** Sheets of paper the typed text needs: it starts TEXT_TOP down the first one and keeps a line free at the end. */
export const paperFor = (textHeight: number): number =>
  Math.max(1, Math.ceil((TEXT_TOP + textHeight + LINE) / SHEET_HEIGHT));

/** How many sheets of paper the typed text runs onto, for a text `textHeight` units tall. */
export const textSheets = (textHeight: number): number =>
  textHeight > 0 ? Math.ceil((TEXT_TOP + textHeight) / SHEET_HEIGHT) : 0;
