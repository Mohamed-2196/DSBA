import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../api/types';
import {
  addedAt,
  askAboutHref,
  cardMeta,
  downloadsLabel,
  examTitle,
  hasExamTitle,
  isNew,
  linkPlace,
  matchLine,
  moduleTag,
  pageParam,
  rowMeta,
  sharedBy,
  sizeLabel,
  statusInfo,
} from './display';

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
    examSession: null,
    authorName: null,
    uploadedBy: { id: 'a5e1c0de-0000-4000-8000-000000000001', displayName: 'Sara A.', year: 2, badge: null },
    status: 'published',
    reviewNote: null,
    downloadCount: 0,
    createdAt: ago(3),
    publishedAt: ago(2),
    starred: false,
    isMine: false,
    canEdit: false,
    match: null,
    coverUrl: null,
    workedAnswers: false,
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
    expect(linkPlace({ url: 'https://vle.example.ac.uk/x' })).toBe('vle.example.ac.uk');
    expect(linkPlace({ url: null })).toBe('another site');
    expect(linkPlace({ url: 'javascript:alert(1)' })).toBe('another site');
    expect(linkPlace({ url: 'https://www.example.com/a' })).toBe('example.com');
    expect(linkPlace({ url: 'https://drive.google.com/file/d/x/view' })).toBe('Google Drive');
    expect(linkPlace({ url: 'https://docs.google.com/document/d/x' })).toBe('Google Drive');
  });

  it('gives a file’s format and size, and a link’s place', () => {
    expect(sizeLabel(item())).toBe('PDF, 412 KB');
    expect(
      sizeLabel(
        item({ format: 'JPG', fileName: 'board.jpg', contentType: 'image/jpeg', sizeBytes: 3.4 * 1024 * 1024 }),
      ),
    ).toBe('JPG, 3.4 MB');
    expect(
      sizeLabel(
        item({ source: 'link', url: 'https://vle.example.ac.uk/x', format: null, fileName: null, sizeBytes: null }),
      ),
    ).toBe('vle.example.ac.uk');
  });

  it('tags a module by its code, or its short name', () => {
    expect(moduleTag({ unitCode: 'ST2133', shortName: 'Distribution theory' })).toBe('ST2133');
    expect(moduleTag({ unitCode: null, shortName: 'Machine learning' })).toBe('Machine learning');
    expect(moduleTag(null)).toBeNull();
  });

  it('matches the card’s line to the sort', () => {
    const it = item({ downloadCount: 3 });
    expect(cardMeta(it, 'popular')).toBe('3 downloads');
    expect(cardMeta(item({ downloadCount: 0 }), 'popular')).toBe('Students’ notes, PDF, 412 KB');
    expect(cardMeta(it, 'title')).toBe('Students’ notes, PDF, 412 KB');
    expect(cardMeta(it, 'new')).toMatch(/^Added /);
    expect(cardMeta(it, 'sitting')).toBe('Students’ notes, PDF, 412 KB');
  });

  it('says on an index card what a file is, then what the sort is about', () => {
    const notes = item({ downloadCount: 3 });
    expect(rowMeta(notes, 'popular')).toBe('Students’ notes · PDF, 412 KB · 3 downloads');
    expect(rowMeta(notes, 'title')).toBe('Students’ notes · PDF, 412 KB');
    expect(rowMeta(item({ downloadCount: 0 }), 'popular')).toBe('Students’ notes · PDF, 412 KB');
    expect(rowMeta(notes, 'new')).toMatch(/^Students’ notes · PDF, 412 KB · added /);
    const paper = item({ kind: 'past-paper', examYear: 2024, examSession: 'may', zone: 'A' });
    expect(rowMeta(paper, 'sitting')).toBe('Past paper · PDF, 412 KB');
    // the title already says "Examiners’ report"
    const report = item({ kind: 'examiners-report', examYear: 2024, examSession: 'may' });
    expect(rowMeta(report, 'sitting')).toBe('PDF, 412 KB');
  });

  it('labels what isn’t public yet: "Not published" for students, never "rejected"', () => {
    expect(statusInfo('pending')).toEqual({ label: 'Waiting for review', tone: 'highlight' });
    expect(statusInfo('rejected')).toEqual({ label: 'Not published', tone: 'alert' });
    expect(statusInfo('removed')?.label).toBe('Removed');
    expect(statusInfo('published')).toBeNull();
  });
});

describe('names', () => {
  const raw = 'ST2133 - Advanced Statistics - Distribution Theory - 2019 Exam - Zone-A';
  const paper = (patch: Partial<LibraryItem> = {}) =>
    item({ kind: 'past-paper', title: raw, examYear: 2019, examSession: 'may', zone: 'A', ...patch });

  it('names a file of a sitting by its sitting and zone', () => {
    expect(examTitle(paper(), 'ST2133')).toBe('ST2133 · May 2019 · Zone A');
    expect(examTitle(paper(), null)).toBe('May 2019 · Zone A');
    expect(examTitle(paper({ zone: 'RTC', examSession: 'october' }), 'MN3141')).toBe('MN3141 · October 2019 · RTC');
    expect(examTitle(paper({ kind: 'examiners-report', zone: null }), 'ST2133')).toBe(
      'ST2133 · May 2019 · Examiners’ report',
    );
    expect(examTitle(paper({ kind: 'exam-solutions', examSession: null, zone: 'B' }), 'ST2133')).toBe(
      'ST2133 · 2019 · Zone B · Solutions',
    );
    expect(hasExamTitle(paper())).toBe(true);
    expect(cardMeta(paper(), 'sitting')).toBe('PDF, 412 KB'); // the title already says it is a paper
  });

  it('keeps the title of anything else', () => {
    expect(examTitle(paper({ examYear: null }), 'ST2133')).toBe(raw);
    expect(examTitle(item({ examYear: 2019 }), 'ST2133')).toBe('ST2133 MGF notes'); // notes have no sitting
    expect(hasExamTitle(paper({ examYear: null }))).toBe(false);
  });

  it('says who shared a file: the credit, or the student and their year or badge', () => {
    expect(sharedBy(item())).toBe('Shared by Sara A. · Year 2');
    expect(sharedBy(item({ authorName: 'Mahdi' }))).toBe('By Mahdi');
    const rep = {
      id: 'a5e1c0de-0000-4000-8000-000000000002',
      displayName: 'Rep',
      year: 3 as const,
      badge: 'Student rep',
    };
    expect(sharedBy(item({ uploadedBy: rep }))).toBe('Shared by Rep · Student rep');
    expect(sharedBy(item({ uploadedBy: { ...rep, year: null, badge: null } }))).toBe('Shared by Rep');
    expect(sharedBy(item({ uploadedBy: null }))).toBeNull(); // imported
    expect(sharedBy(paper())).toBeNull();
  });
});

describe('askAboutHref', () => {
  it('starts a thread about the module, linking the paper', () => {
    const href = askAboutHref(item(), 'ST2133 · May 2019 · Zone A', 'https://hub.example/library/x');
    const q = new URL(href, 'https://hub.example').searchParams;
    expect(href.startsWith('/forum/new?')).toBe(true);
    expect(q.get('module')).toBe('advanced-stats-distribution');
    expect(q.get('body')).toBe('About [ST2133 · May 2019 · Zone A](https://hub.example/library/x):\n\n');
    expect(new URL(askAboutHref(item(), 'a [b]', 'u'), 'https://h').searchParams.get('body')).toBe(
      'About [a b](u):\n\n',
    );
  });
});

describe('matches inside files', () => {
  it('says where the words were found', () => {
    expect(matchLine(item())).toBeNull();
    expect(matchLine(item({ match: { snippet: 'the Cramér–Rao bound', page: 3 } }))).toBe(
      'Page 3: the Cramér–Rao bound',
    );
    expect(matchLine(item({ match: { snippet: 'the likelihood principle', page: null } }))).toBe(
      'the likelihood principle',
    );
  });

  it('reads ?page= as a page number or nothing', () => {
    expect(pageParam('3')).toBe(3);
    expect(['0', '-1', '2.5', 'x', '', null].map(pageParam)).toEqual([null, null, null, null, null, null]);
  });
});
