// Library constants: kinds of files, formats, upload limits and size labels. Order in KINDS is the order used
// in filters and groupings.
import type { LibraryItem } from '../../api/types';

export type LibraryKind = LibraryItem['kind'];
export type ItemSource = LibraryItem['source'];
export type ItemStatus = LibraryItem['status'];

export interface KindInfo {
  id: LibraryKind;
  label: string;
  plural: string;
}

export const KINDS: readonly KindInfo[] = [
  { id: 'past-paper', label: 'Past paper', plural: 'Past papers' },
  { id: 'examiners-report', label: 'Examiners’ report', plural: 'Examiners’ reports' },
  { id: 'subject-guide', label: 'Subject guide', plural: 'Subject guides' },
  { id: 'reading', label: 'Essential reading', plural: 'Essential reading' },
  { id: 'study-guide', label: 'Study guide', plural: 'Study guides' },
  { id: 'exercises', label: 'Exercises', plural: 'Exercises' },
  { id: 'notes', label: 'Students’ notes', plural: 'Students’ notes' },
  { id: 'cheat-sheet', label: 'Cheat sheet', plural: 'Cheat sheets' },
  { id: 'course-materials', label: 'Course materials', plural: 'Course materials' },
  { id: 'vle-materials', label: 'VLE materials', plural: 'VLE materials' },
  { id: 'other', label: 'Other', plural: 'Other files' },
];

export const KIND_BY_ID = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<LibraryKind, KindInfo>;
const KIND_ORDER = Object.fromEntries(KINDS.map((k, i) => [k.id, i])) as Record<LibraryKind, number>;

export function isLibraryKind(value: string | null | undefined): value is LibraryKind {
  return !!value && Object.prototype.hasOwnProperty.call(KIND_BY_ID, value);
}

export function kindLabel(kind: LibraryKind, { plural = false }: { plural?: boolean } = {}): string {
  const k = KIND_BY_ID[kind];
  return k ? (plural ? k.plural : k.label) : 'File';
}

export function byKindOrder(a: LibraryKind, b: LibraryKind): number {
  return (KIND_ORDER[a] ?? 99) - (KIND_ORDER[b] ?? 99);
}

/** Kinds that belong to an exam sitting: they carry an exam year and a zone. */
export const EXAM_KINDS: ReadonlySet<LibraryKind> = new Set<LibraryKind>(['past-paper', 'examiners-report']);

// ── Formats ─────────────────────────────────────────────────────────────────

export interface FormatInfo {
  /** Short tag shown on covers and badges: 'PDF', 'DOCX'. */
  tag: string;
  /** 'PDF document' */
  name: string;
}

const FORMAT_NAMES: Record<string, string> = {
  PDF: 'PDF document',
  DOC: 'Word document',
  DOCX: 'Word document',
  XLS: 'Excel workbook',
  XLSX: 'Excel workbook',
  PPT: 'PowerPoint deck',
  PPTX: 'PowerPoint deck',
  IPYNB: 'Jupyter notebook',
  R: 'R script',
  RMD: 'R Markdown',
  CSV: 'CSV file',
  TXT: 'Text file',
  PNG: 'PNG image',
  JPG: 'JPEG image',
  JPEG: 'JPEG image',
  WEBP: 'WebP image',
  GIF: 'GIF image',
  ZIP: 'ZIP archive',
};

/** The extension of a file name, upper case ('Week 3.pdf' -> 'PDF'), or null. */
export function extensionOf(name: string | null | undefined): string | null {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name ?? '');
  return m ? m[1].toUpperCase() : null;
}

/** What a library item is, format-wise. Links have no format. */
export function formatOf(item: Pick<LibraryItem, 'source' | 'format' | 'fileName'>): FormatInfo | null {
  if (item.source === 'link') return null;
  const tag = (item.format ?? extensionOf(item.fileName) ?? '').toUpperCase();
  if (!tag) return null;
  return { tag, name: FORMAT_NAMES[tag] ?? `${tag} file` };
}

/**
 * Types the browser can show by itself, from a short-lived link (the API serves these inline; everything else
 * is an attachment). Mirrors the API's INLINE_TYPES.
 */
const PREVIEW_TYPES: Record<string, 'pdf' | 'image'> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
};

export function previewKind(item: Pick<LibraryItem, 'source' | 'contentType'>): 'pdf' | 'image' | null {
  if (item.source !== 'file' || !item.contentType) return null;
  return PREVIEW_TYPES[item.contentType.toLowerCase()] ?? null;
}

// ── Uploads ─────────────────────────────────────────────────────────────────

/** What students can upload to the library (mirrors the API's allowlist; the API decides). */
export const UPLOAD_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ipynb: 'application/x-ipynb+json',
  r: 'text/x-r',
  txt: 'text/plain',
  csv: 'text/csv',
};

/** The size limit the API applies to library uploads (DSBA_MAX_UPLOAD_MB). */
export const MAX_UPLOAD_MB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** `accept` for the file picker. */
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES)
  .flatMap((ext) => (ext === 'r' ? ['.r', '.R'] : [`.${ext}`]))
  .join(',');

/** One line for the drop zone. */
export const UPLOAD_LIMITS = `PDF, Word, Excel, PowerPoint, Jupyter notebooks, R scripts, text and CSV files, up to ${MAX_UPLOAD_MB} MB`;

/** The content type to declare for a file: from its extension (browsers often leave notebooks and R scripts blank). */
export function uploadTypeFor(file: Pick<File, 'name' | 'type'>): string | null {
  const ext = extensionOf(file.name)?.toLowerCase();
  return ext ? (UPLOAD_TYPES[ext] ?? null) : null;
}

/** 'Week_3 notes (final).pdf' -> 'Week 3 notes (final)': a starting title for an upload. */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** '412 KB', '3.4 MB' (binary units, as file managers show them). */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  const kb = bytes / 1024;
  if (kb < 1000) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
