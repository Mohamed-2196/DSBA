import { describe, expect, it } from 'vitest';
import type { LibraryItem, PaperQuestion, Sitting } from '../../api/types';
import {
  byChapter,
  cleanClock,
  clockLabel,
  clockLeft,
  clockPause,
  clockResume,
  clockStart,
  durationLabel,
  keepTogether,
  parseDuration,
  WORKED_LABEL,
  answerHref,
  answerLabel,
  paperContext,
  questionAnchor,
  questionHref,
  questionKey,
  questionLink,
  questionLabel,
  questionName,
  questionNumber,
  sittingFiles,
  sittingRow,
  yourZoneFirst,
} from './papers';

function file(id: string, kind: LibraryItem['kind'], zone: LibraryItem['zone']): LibraryItem {
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
    coverUrl: null,
    workedAnswers: false,
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
    paper: {
      id: 'za',
      slug: 'ec1002-za-may-2024',
      title: 'EC1002 ZA',
      examYear: 2024,
      examSession: 'may',
      zone: 'A',
      coverUrl: null,
    },
    chapterId: 'c1',
    chapterTitle: 'Elasticity',
    section: null,
    question: 3,
    page: null,
    flagged: false,
    flagCount: null,
    isMine: false,
    canRemove: false,
    createdAt: '2026-10-01T00:00:00Z',
    answer: null,
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
      zones: [
        ...MAY_2024.zones.slice(0, 2),
        { zone: 'RTC', papers: [rtc], reports: [rtcReport], solutions: [] },
        MAY_2024.zones[2],
      ],
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
    expect(questionLabel(tag({ section: 'B', question: 1, page: 7 }))).toBe('B1 (p. 7)');
    expect(questionName(tag({ section: 'B', question: 1 }))).toBe('B1');
    expect(questionNumber(tag({ section: 'B', question: 1 }))).toBe('B1');
    expect(questionNumber(tag({}))).toBe('3');
    expect(questionHref(tag({}))).toBe('/library/ec1002-za-may-2024');
    expect(questionHref(tag({ page: 4 }))).toBe('/library/ec1002-za-may-2024?page=4');
  });

  it('anchors a question on its paper for the forum, and opens its worked answer', () => {
    expect(questionAnchor(tag({}))).toBe('q3');
    expect(questionAnchor(tag({ section: 'B', question: 1 }))).toBe('b1');
    expect(questionLink(tag({ page: 4 }))).toBe('/library/ec1002-za-may-2024?page=4#q3');
    expect(questionLink(tag({ section: 'B', question: 1 }))).toBe('/library/ec1002-za-may-2024#b1');
    const answer = { id: 'r', slug: 'ec1002-report-may-2024', page: 7 };
    expect(answerHref(answer)).toBe('/library/ec1002-report-may-2024?page=7');
    expect(answerLabel(answer)).toBe('Worked answer, report p. 7');
    expect(questionKey({ itemId: 'za', section: null, question: 3 })).toBe('za/Q3');
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

describe('yourZoneFirst', () => {
  const z = (zone: 'A' | 'B' | null) => ({ zone, papers: [], reports: [], solutions: [] });
  it('puts your zone first, the rest as they came', () => {
    expect(yourZoneFirst([z('A'), z('B'), z(null)], 'B').map((x) => x.zone)).toEqual(['B', 'A', null]);
    expect(yourZoneFirst([z('A'), z('B')], null).map((x) => x.zone)).toEqual(['A', 'B']);
  });
});

describe('sittingRow', () => {
  it('says the report has worked answers where the sitting has no solutions', () => {
    const worked = { ...report, workedAnswers: true };
    const zones = MAY_2024.zones.map((z) => (z.zone === null ? { ...z, reports: [worked] } : z));
    expect(sittingRow({ ...MAY_2024, zones }, 'B').worked).toBeNull(); // zone A's solutions are in the row
    const noSolutions = zones.map((z) => ({ ...z, solutions: [] }));
    expect(sittingRow({ ...MAY_2024, zones: noSolutions }, 'B').worked).toEqual({ item: worked, label: WORKED_LABEL });
    const comments = MAY_2024.zones.map((z) => ({ ...z, solutions: [] }));
    expect(sittingRow({ ...MAY_2024, zones: comments }, 'B').worked).toBeNull(); // the report comments only
  });

  it('gives a sitting one row: each zone’s paper, your zone first, its report and solutions', () => {
    const row = sittingRow(MAY_2024, 'B');
    expect(row.papers.map((p) => [p.item.id, p.label, p.yours])).toEqual([
      ['zb', 'Zone B', true],
      ['za', 'Zone A', false],
    ]);
    expect(row.reports.map((l) => [l.item.id, l.label])).toEqual([['report', 'Report']]);
    expect(row.solutions.map((l) => [l.item.id, l.label])).toEqual([['za-solutions', 'Solutions']]);
    expect(row.timeMe?.id).toBe('zb');
    expect(sittingRow(MAY_2024, null).timeMe?.id).toBe('za');
  });

  it('names reports by zone when the zones have their own, and numbers a second one', () => {
    const reportA = file('ra', 'examiners-report', 'A');
    const reportB = file('rb', 'examiners-report', 'B');
    const sitting: Sitting = {
      examYear: 2023,
      session: 'october',
      zones: [
        { zone: 'A', papers: [], reports: [reportA], solutions: [] },
        { zone: 'B', papers: [], reports: [reportB], solutions: [] },
        { zone: null, papers: [file('p', 'past-paper', null)], reports: [], solutions: [] },
      ],
    };
    const row = sittingRow(sitting, null);
    expect(row.papers.map((p) => p.label)).toEqual(['Paper']);
    expect(row.reports.map((l) => l.label)).toEqual(['Zone A report', 'Zone B report']);
    const two: Sitting = {
      ...sitting,
      zones: [{ zone: null, papers: [], reports: [reportA, reportB], solutions: [] }],
    };
    expect(sittingRow(two, 'A').reports.map((l) => l.label)).toEqual(['Report', 'Report 2']);
    expect(sittingRow(two, 'A').timeMe).toBeNull();
  });
});

describe('the Time me clock', () => {
  it('counts down from timestamps, pauses and resumes', () => {
    const c = clockStart(3600_000, 1000);
    expect(clockLeft(c, 1000 + 600_000)).toBe(3000_000);
    const paused = clockPause(c, 1000 + 600_000);
    expect(clockLeft(paused, 1000 + 99 * 3600_000)).toBe(3000_000); // paused: time stands still
    const resumed = clockResume(paused, 10_000_000);
    expect(clockLeft(resumed, 10_000_000 + 1000)).toBe(2999_000);
    expect(clockLeft(resumed, 10_000_000 + 4000_000)).toBe(0);
  });

  it('reads a stored clock back only when it makes sense', () => {
    const now = 50_000_000;
    expect(cleanClock({ total: 3600_000, endsAt: now + 10, pausedLeft: null }, now)).toEqual({
      total: 3600_000,
      endsAt: now + 10,
      pausedLeft: null,
    });
    expect(cleanClock({ total: 3600_000, endsAt: null, pausedLeft: 5000 }, now)?.pausedLeft).toBe(5000);
    expect(cleanClock({ total: 3600_000, endsAt: now - 7 * 3600_000, pausedLeft: null }, now)).toBeNull();
    expect(cleanClock({ total: 5, endsAt: now, pausedLeft: null }, now)).toBeNull();
    expect(cleanClock('soon', now)).toBeNull();
  });

  it('takes any duration from a minute to 12 hours', () => {
    expect(parseDuration('2', '30')).toBe(9000_000);
    expect(parseDuration('', '45')).toBe(2700_000);
    expect(parseDuration('0', '0')).toBeNull();
    expect(parseDuration('13', '0')).toBeNull();
    expect(parseDuration('1', '60')).toBeNull();
    expect(parseDuration('1.5', '')).toBeNull();
    expect(durationLabel(9000_000)).toBe('2 hours 30 minutes');
    expect(durationLabel(3600_000)).toBe('1 hour');
    expect(durationLabel(60_000)).toBe('1 minute');
  });
});

describe('keepTogether', () => {
  it('keeps the zone and the last word in one piece', () => {
    expect(keepTogether('Zone A report 2')).toBe('Zone\u00a0A report\u00a02');
    expect(keepTogether('Zone A report')).toBe('Zone\u00a0A report');
    expect(keepTogether('Report')).toBe('Report');
    expect(keepTogether('Report (2)')).toBe('Report\u00a0(2)');
  });
});
