import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../api/types';
import { addedAt, cardMeta, downloadsLabel, examLabel, isNew, linkHost, linkPlace, moduleTag, sizeLabel, statusInfo } from './display';

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-10-12T12:00:00Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function item(patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: '0b7f3c1e-5c2a-4d38-9a51-7f1d2c3b4a5e',
    slug: 'st2133-mgf-notes',
    source: 'file',
    kind: 'notes',
    title: 'ST2133 MGF notes',
    description: null,
    moduleId: 'advanced-stats-distribution',
    year: 2,
    url: null,
    fileName: 'MGF notes.pdf',
    contentType: 'application/pdf',
    sizeBytes: 412 * 1024,
    format: 'PDF',
    examYear: null,
    zone: null,
    authorName: null,
    uploadedBy: { id: 'a5e1c0de-0000-4000-8000-000000000001', displayName: 'Sara A.', year: 2, role: 'student' },
    status: 'published',
    reviewNote: null,
    downloadCount: 0,
    createdAt: ago(3),
    publishedAt: ago(2),
    starred: false,
    isMine: false,
    canEdit: false,
    ...patch,
  };
}

describe('dates', () => {
  it('counts from publication, or the upload while it waits', () => {
    expect(addedAt(item())).toBe(ago(2));
    expect(addedAt(item({ status: 'pending', publishedAt: null }))).toBe(ago(3));
  });

  it('calls a file new for a week after a student shared it', () => {
    expect(isNew(item(), NOW)).toBe(true);
    expect(isNew(item({ publishedAt: ago(8) }), NOW)).toBe(false);
    expect(isNew(item({ uploadedBy: null }), NOW)).toBe(false); // imported with the library: not news
    expect(isNew(item({ status: 'pending' }), NOW)).toBe(false);
  });
});

describe('labels', () => {
  it('counts downloads', () => {
    expect(downloadsLabel(1)).toBe('1 download');
    expect(downloadsLabel(0)).toBe('0 downloads');
    expect(downloadsLabel(12345)).toBe('12,345 downloads');
  });

  it('says where a link leads', () => {
    expect(linkHost('https://www.example.com/a')).toBe('example.com');
    expect(linkHost('javascript:alert(1)')).toBeNull();
    expect(linkHost('not a url')).toBeNull();
    expect(linkPlace({ url: 'https://drive.google.com/drive/folders/x' })).toBe('Google Drive');
    expect(linkPlace({ url: 'https://docs.google.com/document/d/x' })).toBe('Google Drive');
    expect(linkPlace({ url: 'https://vle.example.ac.uk/x' })).toBe('vle.example.ac.uk');
    expect(linkPlace({ url: null })).toBe('another site');
  });

  it('gives a file’s format and size, and a link’s place', () => {
    expect(sizeLabel(item())).toBe('PDF, 412 KB');
    expect(sizeLabel(item({ format: 'JPG', fileName: 'board.jpg', contentType: 'image/jpeg', sizeBytes: 3.4 * 1024 * 1024 }))).toBe('JPG, 3.4 MB');
    expect(sizeLabel(item({ source: 'link', url: 'https://drive.google.com/x', format: null, fileName: null, sizeBytes: null }))).toBe('Google Drive');
  });

  it('tags a module by its code, or its short name', () => {
    expect(moduleTag({ unitCode: 'ST2133', shortName: 'Distribution theory' })).toBe('ST2133');
    expect(moduleTag({ unitCode: null, shortName: 'Machine learning' })).toBe('Machine learning');
    expect(moduleTag(null)).toBeNull();
  });

  it('matches the card’s line to the sort', () => {
    const it = item({ downloadCount: 3 });
    expect(cardMeta(it, 'popular')).toBe('3 downloads');
    expect(cardMeta(it, 'title')).toBe('Students’ notes, PDF, 412 KB');
    expect(cardMeta(it, 'new')).toMatch(/^Added /);
  });

  it('names an exam sitting', () => {
    expect(examLabel({ examYear: 2024, zone: 'A' })).toBe('2024, Zone A');
    expect(examLabel({ examYear: 2023, zone: null })).toBe('2023');
    expect(examLabel({ examYear: null, zone: null })).toBeNull();
  });

  it('labels what isn’t public yet: "Not published" for students, never "rejected"', () => {
    expect(statusInfo('pending')).toEqual({ label: 'Waiting for review', tone: 'highlight' });
    expect(statusInfo('rejected')).toEqual({ label: 'Not published', tone: 'alert' });
    expect(statusInfo('removed')?.label).toBe('Removed');
    expect(statusInfo('published')).toBeNull();
  });
});
