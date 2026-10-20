import { describe, expect, it } from 'vitest';
import type { ExamWeek, LibraryItem, PaperQuestion, SiteDoc, Sitting } from '../../api/types';
import { readSeed } from '../../testing/seed';
import type { CalendarEvent } from '../calendar/public';
import {
  ALL_EXAM_WEEK_PARTS,
  examDayWord,
  examWeekExam,
  moduleDatesAhead,
  mostAskedChapter,
  practiceLinks,
} from './examWeek';
import type { ExamSession, SessionEvent } from './session';

const SEED = readSeed<SiteDoc>('site').examWeek;

const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e',
  date: '2026-10-22',
  endDate: null,
  time: null,
  place: null,
  title: 'Exam',
  type: 'exam',
  year: 1,
  moduleId: 'mathematics',
  unitCode: 'MT1186',
  duration: null,
  rules: null,
  source: null,
  checkedOn: null,
  employerId: null,
  sample: false,
  ...over,
});

const sessionEvent = (over: Partial<CalendarEvent>, days: number): SessionEvent => ({
  ...event(over),
  days,
  module: null,
  when: new Date(2026, 9, 20 + days),
});

const session = (...exams: SessionEvent[]): ExamSession => ({
  today: new Date(2026, 9, 20),
  next: exams[0] as SessionEvent,
  exams,
  kind: 'exams',
});

describe('examWeekExam', () => {
  const on: ExamWeek = { on: true, daysBefore: 7, lead: ['countdown'] };

  it('starts as the seed says: on, a week before, every part', () => {
    expect(SEED.on).toBe(true);
    expect(SEED.daysBefore).toBe(7);
    expect([...SEED.lead].sort()).toEqual([...ALL_EXAM_WEEK_PARTS].sort());
  });

  it('leads with the first real exam within the days before', () => {
    const mock = sessionEvent({ id: 'm', type: 'mock' }, 1);
    const exam = sessionEvent({ id: 'x' }, 2);
    expect(examWeekExam(session(mock, exam), on)?.id).toBe('x');
    expect(examWeekExam(session(sessionEvent({ id: 'today' }, 0)), on)?.id).toBe('today');
  });

  it('waits until the exam is close enough', () => {
    const exam = sessionEvent({}, 8);
    expect(examWeekExam(session(exam), on)).toBeNull();
    expect(examWeekExam(session(exam), { ...on, daysBefore: 10 })).not.toBeNull();
  });

  it('is nothing while switched off, without settings, with only mocks or with no exams', () => {
    const exam = sessionEvent({}, 2);
    expect(examWeekExam(session(exam), { ...on, on: false })).toBeNull();
    expect(examWeekExam(session(exam), undefined)).toBeNull();
    expect(examWeekExam(session(sessionEvent({ type: 'mock' }, 1)), on)).toBeNull();
    expect(examWeekExam(null, on)).toBeNull();
    expect(examWeekExam({ ...session(exam), kind: 'event' }, on)).toBeNull();
  });
});

describe('examDayWord', () => {
  it('says the day plainly', () => {
    const thu = new Date(2026, 9, 22);
    expect(examDayWord(0, thu)).toBe('today');
    expect(examDayWord(1, thu)).toBe('tomorrow');
    expect(examDayWord(2, thu)).toBe('Thursday');
    expect(examDayWord(9, thu)).toBe('22 Oct');
  });
});

const item = (slug: string): LibraryItem => ({ slug, id: slug, title: slug }) as LibraryItem;

describe('practiceLinks', () => {
  it('takes the newest sitting’s paper, worked answers and report, from whichever zone has them', () => {
    const sittings: Sitting[] = [
      {
        examYear: 2025,
        session: 'may',
        zones: [
          { zone: 'A', papers: [item('a-paper')], reports: [], solutions: [] },
          { zone: 'B', papers: [item('b-paper')], reports: [item('b-report')], solutions: [item('b-answers')] },
        ],
      },
      {
        examYear: 2024,
        session: 'may',
        zones: [{ zone: 'A', papers: [item('old')], reports: [item('old-r')], solutions: [item('old-s')] }],
      },
    ];
    expect(practiceLinks(sittings)).toEqual({
      paper: { slug: 'a-paper', label: 'May 2025' },
      answers: { slug: 'b-answers' },
      report: { slug: 'b-report' },
    });
  });

  it('has nothing without sittings', () => {
    expect(practiceLinks([])).toEqual({ paper: null, answers: null, report: null });
  });
});

describe('mostAskedChapter', () => {
  const q = (chapterId: string, chapterTitle: string): PaperQuestion => ({ chapterId, chapterTitle }) as PaperQuestion;
  it('counts the questions tagged with each chapter', () => {
    const qs = [
      q('a', 'Functions'),
      q('b', 'Integration'),
      q('b', 'Integration'),
      q('a', 'Functions'),
      q('b', 'Integration'),
    ];
    expect(mostAskedChapter(qs)).toEqual({ chapterId: 'b', title: 'Integration', count: 3 });
    expect(mostAskedChapter([q('a', 'Functions'), q('b', 'Integration')])?.chapterId).toBe('a');
    expect(mostAskedChapter([])).toBeNull();
  });
});

describe('moduleDatesAhead', () => {
  it('lists the module’s other dates ahead, soonest first', () => {
    const exam = sessionEvent({ id: 'x', date: '2026-10-22' }, 2);
    const events = [
      event({ id: 'x', date: '2026-10-22' }),
      event({ id: 'late', date: '2026-11-30', type: 'deadline' }),
      event({ id: 'soon', date: '2026-10-25', type: 'mock' }),
      event({ id: 'past', date: '2026-10-01', type: 'mock' }),
      event({ id: 'open', date: '2026-10-01', endDate: '2026-10-30', type: 'deadline' }),
      event({ id: 'other', moduleId: 'statistics' }),
      event({ id: 'tbc', date: '2026-10-28', sample: true }),
    ];
    expect(moduleDatesAhead(events, exam, '2026-10-20').map((e) => e.id)).toEqual(['open', 'soon', 'late']);
    expect(moduleDatesAhead(events, exam, '2026-10-20', 1).map((e) => e.id)).toEqual(['open']);
    expect(moduleDatesAhead(events, sessionEvent({ moduleId: null }, 2), '2026-10-20')).toEqual([]);
  });
});
