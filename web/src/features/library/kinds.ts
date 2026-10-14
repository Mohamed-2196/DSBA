// Library constants: kinds of files and formats. Order in KINDS is the order used in filters and groupings.
import type { LibraryItem } from '../../api/types';
import { fileExtension } from '../../api/uploads';

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
  { id: 'exam-solutions', label: 'Solutions', plural: 'Solutions' },
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

export function isLibraryKind(value: string | null | undefined): value is LibraryKind {
  return !!value && Object.prototype.hasOwnProperty.call(KIND_BY_ID, value);
}

export function kindLabel(kind: LibraryKind, { plural = false }: { plural?: boolean } = {}): string {
  const k = KIND_BY_ID[kind];
  return k ? (plural ? k.plural : k.label) : 'File';
}

/** Kinds that belong to an exam sitting: they carry an exam year, a session and a zone. */
export const EXAM_KINDS: ReadonlySet<LibraryKind> = new Set<LibraryKind>(['past-paper', 'examiners-report', 'exam-solutions']);

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
  return fileExtension(name)?.toUpperCase() ?? null;
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
// What the library takes, its size limit and the size labels live with the upload pipeline: src/api/uploads.ts.

/** How many of a student's files may wait for review at once (the API's MAX_PENDING, security review SEC-14). */
export const MAX_PENDING_UPLOADS = 10;

/** 'Week_3 notes (final).pdf' -> 'Week 3 notes (final)': a starting title for an upload. */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
