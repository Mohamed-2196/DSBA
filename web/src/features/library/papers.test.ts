import { describe, expect, it } from 'vitest';
import type { LibraryItem, PaperQuestion, Sitting } from '../../api/types';
import { byChapter, clockLabel, paperContext, questionHref, questionLabel, sittingFiles } from './papers';

function file(id: string, kind: LibraryItem['kind'], zone: string | null): LibraryItem {
  return {
    id,
    slug: id,
    source: 'file',
    kind,
    title: id,
    description: null,
    moduleId: 'economics',
    year: 1,
    url: null,
    fileName: `${id}.pdf`,
    contentType: 'application/pdf',
    sizeBytes: 1000,
    format: 'PDF',
    examYear: 2024,
    zone,
    examSession: 'may',
    authorName: null,
    uploadedBy: null,
    status: 'published',
    reviewNote: null,
    downloadCount: 0,
    createdAt: '2026-09-01T00:00:00Z',
    publishedAt: '2026-09-01T00:00:00Z',
    starred: false,
    isMine: false,
    canEdit: false,
    match: null,
  };
}

const paperA = file('za', 'past-paper', 'A');
const paperB = file('zb', 'past-paper', 'B');
const solutionsA = file('za-solutions', 'exam-solutions', 'A');
const report = file('report', 'examiners-report', null);
const MAY_2024: Sitting = {
  examYear: 2024,
  session: 'may',
  zones: [
    { zone: 'A', papers: [paperA], reports: [], solutions: [solutionsA] },
    { zone: 'B', papers: [paperB], reports: [], solutions: [] },
    { zone: null, papers: [], reports: [report], solutions: [] },
  ],
};

function tag(patch: Partial<PaperQuestion>): PaperQuestion {
  return {
    id: 'q1',
    paper: { id: 'za', slug: 'ec1002-za-may-2024', title: 'EC1002 ZA', examYear: 2024, examSession: 'may', zone: 'A' },
    chapterId: 'c1',
    chapterTitle: 'Elasticity',
    question: 3,
    page: null,
    flagged: false,
    flagCount: null,
    isMine: false,
    canRemove: false,
    createdAt: '2026-10-01T00:00:00Z',
    ...patch,
  };
}

describe('paperContext', () => {
  it('pairs a paper with the report for both zones, its solutions and the other zone’s paper', () => {
    const ctx = paperContext([MAY_2024], 'za');
    expect(ctx?.reports.map((f) => f.id)).toEqual(['report']);
    expect(ctx?.solutions.map((f) => f.id)).toEqual(['za-solutions']);
    expect(ctx?.otherPapers).toEqual([{ zone: 'B', item: paperB }]);
  });

  it('pairs an RTC paper with the RTC report and the zones’ papers', () => {
    const rtc = file('rtc', 'past-paper', 'RTC');
    const rtcReport = file('rtc-report', 'examiners-report', 'RTC');
    const sitting: Sitting = {
      ...MAY_2024,
      zones: [...MAY_2024.zones.slice(0, 2), { zone: 'RTC', papers: [rtc], reports: [rtcReport], solutions: [] }, MAY_2024.zones[2]],
    };
    const ctx = paperContext([sitting], 'rtc');
    expect(ctx?.reports.map((f) => f.id)).toEqual(['rtc-report', 'report']);
    expect(ctx?.otherPapers.map((p) => p.zone)).toEqual(['A', 'B']);
    expect(paperContext([sitting], 'za')?.reports.map((f) => f.id)).toEqual(['report']);
  });

  it('gives a report its papers, and nothing for a file in no sitting', () => {
    expect(paperContext([MAY_2024], 'report')?.otherPapers.map((p) => p.item.id)).toEqual(['za', 'zb']);
    expect(paperContext([MAY_2024], 'elsewhere')).toBeNull();
    expect(paperContext(undefined, 'za')).toBeNull();
    expect(sittingFiles(MAY_2024)).toHaveLength(4);
  });
});

describe('questions', () => {
  it('labels a question and opens its paper at its page', () => {
    expect(questionLabel(tag({}))).toBe('Q3');
    expect(questionLabel(tag({ page: 4 }))).toBe('Q3 (p. 4)');
    expect(questionHref(tag({}))).toBe('/library/ec1002-za-may-2024');
    expect(questionHref(tag({ page: 4 }))).toBe('/library/ec1002-za-may-2024?page=4');
  });

  it('groups tags by chapter in the API’s order', () => {
    const grouped = byChapter([tag({ id: 'a' }), tag({ id: 'b', chapterId: 'c2' }), tag({ id: 'c' })]);
    expect([...grouped.keys()]).toEqual(['c1', 'c2']);
    expect(grouped.get('c1')?.map((t) => t.id)).toEqual(['a', 'c']);
  });
});

describe('clockLabel', () => {
  it('counts down in hours, minutes and seconds', () => {
    expect(clockLabel(3 * 3600_000)).toBe('3:00:00');
    expect(clockLabel(4 * 60_000 + 7_000)).toBe('0:04:07');
    expect(clockLabel(-5)).toBe('0:00:00');
  });
});
