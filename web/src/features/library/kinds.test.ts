import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../api/types';
import {
  EXAM_KINDS,
  KINDS,
  KIND_BY_ID,
  MAX_PENDING_UPLOADS,
  extensionOf,
  formatOf,
  isLibraryKind,
  kindLabel,
  previewKind,
  titleFromFileName,
} from './kinds';

// Every kind the API knows (schemas/library.py LibraryKind), in the library's order.
const API_KINDS: LibraryItem['kind'][] = [
  'past-paper',
  'examiners-report',
  'exam-solutions',
  'subject-guide',
  'reading',
  'study-guide',
  'exercises',
  'notes',
  'cheat-sheet',
  'course-materials',
  'vle-materials',
  'other',
];

describe('kinds', () => {
  it('has a label for every kind the API knows, in order', () => {
    expect(KINDS.map((k) => k.id)).toEqual(API_KINDS);
    for (const kind of API_KINDS) expect(KIND_BY_ID[kind].label).toBeTruthy();
  });

  it('reads kinds from the URL safely', () => {
    expect(isLibraryKind('past-paper')).toBe(true);
    expect(isLibraryKind('toString')).toBe(false);
    expect(isLibraryKind('')).toBe(false);
    expect(isLibraryKind(null)).toBe(false);
  });

  it('names kinds in sentence case', () => {
    expect(kindLabel('notes')).toBe('Students’ notes');
    expect(kindLabel('past-paper', { plural: true })).toBe('Past papers');
    expect(kindLabel('other', { plural: true })).toBe('Other files');
  });

  it('knows which kinds belong to an exam sitting', () => {
    expect([...EXAM_KINDS]).toEqual(['past-paper', 'examiners-report', 'exam-solutions']);
  });

  it('mirrors the API’s limit on files waiting for review', () => {
    expect(MAX_PENDING_UPLOADS).toBe(10);
  });
});

describe('formats', () => {
  const file = (patch: Partial<Pick<LibraryItem, 'source' | 'format' | 'fileName'>>) => ({
    source: 'file' as const,
    format: null,
    fileName: null,
    ...patch,
  });

  it('reads the extension', () => {
    expect(extensionOf('Week 3 notes.pdf')).toBe('PDF');
    expect(extensionOf('board.JPEG')).toBe('JPEG');
    expect(extensionOf('notes')).toBeNull();
    expect(extensionOf(null)).toBeNull();
  });

  it('names a file’s format, pictures included (D9)', () => {
    expect(formatOf(file({ format: 'PDF' }))).toEqual({ tag: 'PDF', name: 'PDF document' });
    expect(formatOf(file({ format: 'JPG' }))).toEqual({ tag: 'JPG', name: 'JPEG image' });
    expect(formatOf(file({ format: 'WEBP' }))).toEqual({ tag: 'WEBP', name: 'WebP image' });
    expect(formatOf(file({ fileName: 'scan.png' }))).toEqual({ tag: 'PNG', name: 'PNG image' });
    expect(formatOf(file({ fileName: 'odd.xyz' }))).toEqual({ tag: 'XYZ', name: 'XYZ file' });
    expect(formatOf(file({}))).toBeNull();
    expect(formatOf({ source: 'link', format: null, fileName: null })).toBeNull();
  });

  it('previews PDFs and pictures, nothing else', () => {
    const item = (contentType: string | null, source: LibraryItem['source'] = 'file') => ({ source, contentType });
    expect(previewKind(item('application/pdf'))).toBe('pdf');
    expect(previewKind(item('image/jpeg'))).toBe('image');
    expect(previewKind(item('image/webp'))).toBe('image');
    expect(previewKind(item('IMAGE/PNG'))).toBe('image');
    expect(previewKind(item('application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBeNull();
    expect(previewKind(item('image/svg+xml'))).toBeNull();
    expect(previewKind(item(null))).toBeNull();
    expect(previewKind(item('application/pdf', 'link'))).toBeNull();
  });
});

describe('titleFromFileName', () => {
  it('makes a starting title from a file name', () => {
    expect(titleFromFileName('Week_3 notes (final).pdf')).toBe('Week 3 notes (final)');
    expect(titleFromFileName('IMG_2041.jpg')).toBe('IMG 2041');
    expect(titleFromFileName('ملاحظات.pdf')).toBe('ملاحظات');
    expect(titleFromFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(200);
  });
});
