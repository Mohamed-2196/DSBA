import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../api/types';
import { latestSittings, sharedBy, showsProgress } from './overview';

let seq = 0;
const paper = (over: Partial<LibraryItem> = {}): LibraryItem => {
  seq += 1;
  return {
    id: `p${seq}`,
    slug: `p${seq}`,
    source: 'file',
    kind: 'past-paper',
    title: `Paper ${seq}`,
    description: null,
    moduleId: 'm',
    year: 2,
    url: null,
    fileName: null,
    contentType: null,
    sizeBytes: null,
    format: null,
    examYear: null,
    zone: null,
    examSession: null,
    authorName: null,
    uploadedBy: null,
    status: 'published',
    reviewNote: null,
    downloadCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    publishedAt: null,
    starred: false,
    isMine: false,
    canEdit: false,
    match: null,
    coverUrl: null,
    ...over,
  };
};

describe('latestSittings', () => {
  it('lists the newest sittings first, October after May of the same year, zones in order', () => {
    const may24a = paper({ examYear: 2024, examSession: 'may', zone: 'A' });
    const oct24 = paper({ examYear: 2024, examSession: 'october', zone: 'A' });
    const may25b = paper({ examYear: 2025, examSession: 'may', zone: 'B' });
    const may25a = paper({ examYear: 2025, examSession: 'may', zone: 'A' });
    const old = paper({ examYear: 2019, examSession: 'may', zone: 'A' });
    const out = latestSittings([may24a, old, may25b, oct24, may25a], 3);
    expect(out.map((s) => s.label)).toEqual(['May 2025', 'October 2024', 'May 2024']);
    expect(out[0].papers.map((p) => p.id)).toEqual([may25a.id, may25b.id]);
  });
  it('keeps the first paper of a zone and leaves out papers without a year', () => {
    const newest = paper({ examYear: 2023, examSession: 'may', zone: 'A' });
    const older = paper({ examYear: 2023, examSession: 'may', zone: 'A' });
    const out = latestSittings([newest, older, paper()], 5);
    expect(out).toHaveLength(1);
    expect(out[0].papers.map((p) => p.id)).toEqual([newest.id]);
  });
});

describe('sharedBy', () => {
  it('prefers the named author, then the uploader', () => {
    const user = { id: 'u', displayName: 'Test Student', year: 2 as const, badge: null };
    expect(sharedBy({ authorName: 'A. Writer', uploadedBy: user })).toBe('A. Writer');
    expect(sharedBy({ authorName: '  ', uploadedBy: user })).toBe('Test Student');
    expect(sharedBy({ authorName: null, uploadedBy: null })).toBeNull();
  });
});

describe('showsProgress', () => {
  it('needs tracking and a lesson begun', () => {
    expect(showsProgress(false, { c: 0, v: 1, at: 1, kind: 'resume' })).toBe(false);
    expect(showsProgress(true, { c: 0, v: 0, at: null, kind: 'start' })).toBe(false);
    expect(showsProgress(true, null)).toBe(false);
    expect(showsProgress(true, { c: 1, v: 0, at: 1, kind: 'next' })).toBe(true);
  });
});
