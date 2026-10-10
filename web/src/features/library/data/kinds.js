// File kinds and formats in the library. Order here is the order used in filters and groupings.

export const KINDS = [
  { id: 'past-paper', label: 'Past paper', plural: 'Past papers', short: 'Papers' },
  { id: 'examiners-report', label: 'Examiners’ report', plural: 'Examiners’ reports', short: 'Reports' },
  { id: 'subject-guide', label: 'Subject guide', plural: 'Subject guides', short: 'Guides' },
  { id: 'reading', label: 'Essential reading', plural: 'Essential reading', short: 'Reading' },
  { id: 'study-guide', label: 'Study guide', plural: 'Study guides', short: 'Study guides' },
  { id: 'exercises', label: 'Exercise set', plural: 'Exercise sets', short: 'Exercises' },
  { id: 'notes', label: 'Students’ notes', plural: 'Students’ notes', short: 'Notes' },
  { id: 'cheat-sheet', label: 'Cheat sheet', plural: 'Cheat sheets', short: 'Cheat sheets' },
];

export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k]));
export const KIND_ORDER = Object.fromEntries(KINDS.map((k, i) => [k.id, i]));

export function kindLabel(id, { plural = false } = {}) {
  const k = KIND_BY_ID[id];
  return k ? (plural ? k.plural : k.label) : '';
}

/** Formats: file extension, human name, and the page geometry the viewer renders them at (CSS px). */
export const FORMATS = {
  PDF: { ext: 'pdf', name: 'PDF document', page: 'a4' },
  DOCX: { ext: 'docx', name: 'Word document', page: 'a4' },
  XLSX: { ext: 'xlsx', name: 'Excel workbook', page: 'sheet' },
  PPTX: { ext: 'pptx', name: 'PowerPoint deck', page: 'slide' },
  IPYNB: { ext: 'ipynb', name: 'Jupyter notebook', page: 'a4' },
  R: { ext: 'R', name: 'R script', page: 'a4' },
  // An image is its own page: use pageSizeOf(file), which reads the picture's pixels ('a4' is only the fallback).
  PNG: { ext: 'png', name: 'PNG image', page: 'a4' },
};

/** Page sizes: A4 portrait at 96 dpi, a 16:9 slide, and an A4 landscape sheet. */
export const PAGE_SIZES = {
  a4: { w: 794, h: 1123 },
  slide: { w: 1123, h: 632 },
  sheet: { w: 1123, h: 794 },
};

export function pageSizeFor(format) {
  return PAGE_SIZES[FORMATS[format]?.page || 'a4'];
}

/** The size one page of a file renders at: its format's geometry, or an image file's own pixels. */
export function pageSizeOf(file) {
  return file?.image ? { w: file.image.width, h: file.image.height } : pageSizeFor(file?.format);
}

/** What a "page" is called for a format. */
export function pageNoun(format, n = 2) {
  if (format === 'PPTX') return n === 1 ? 'slide' : 'slides';
  if (format === 'XLSX') return n === 1 ? 'sheet' : 'sheets';
  return n === 1 ? 'page' : 'pages';
}

/** '412 KB', '3.4 MB'. */
export function formatSize(kb) {
  if (kb < 1000) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Accept types for the upload picker. */
export const UPLOAD_ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.ipynb,.r,.R';

/** Format from a file name, or null if unsupported. */
export function formatFromName(name = '') {
  const ext = String(name).split('.').pop().toLowerCase();
  return { pdf: 'PDF', docx: 'DOCX', doc: 'DOCX', xlsx: 'XLSX', xls: 'XLSX', pptx: 'PPTX', ppt: 'PPTX', ipynb: 'IPYNB', r: 'R' }[ext] || null;
}
