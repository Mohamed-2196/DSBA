// Exam week on Home (IDEA-48): in the days before a student's exam, Home on a phone leads with that exam instead of
// the desk shelf. Admins choose in Site settings whether it does, from how many days before, and what leads, in order.
// Pure, so the rules are tested (examWeek.test.ts); ExamWeekLead.tsx draws it.
import type { ExamWeek, PaperQuestion, Sitting } from '../../api/types';
import type { CalendarEvent } from '../calendar/public';
import { formatDayMonth, weekdayOf } from '../../lib/dates';
import { sittingLabel } from '../../lib/exams';
import type { ExamSession, SessionEvent } from './session';

export type ExamWeekPart = ExamWeek['lead'][number];

/** What each part shows: Site settings lists them by these names. */
export const EXAM_WEEK_PARTS: Readonly<Record<ExamWeekPart, { title: string; description: string }>> = {
  countdown: { title: 'The exam', description: 'Its day, time and place, and the days left.' },
  practice: {
    title: 'Practise',
    description: 'The newest paper, its worked answers and examiners’ report, and the most asked chapter.',
  },
  papers: { title: 'Latest past papers', description: 'The module’s newest sittings.' },
  dates: { title: 'The module’s dates', description: 'Its other dates ahead: mocks, deadlines, more exams.' },
};

export const ALL_EXAM_WEEK_PARTS = Object.keys(EXAM_WEEK_PARTS) as ExamWeekPart[];

/**
 * The exam that leads Home now: the first real exam (not a mock) of the session ahead, when exam week is on and it is
 * at most `daysBefore` days away. null otherwise, or while the settings haven't loaded.
 */
export function examWeekExam(session: ExamSession | null, settings: ExamWeek | null | undefined): SessionEvent | null {
  if (!settings?.on || session?.kind !== 'exams') return null;
  const exam = session.exams.find((e) => e.type === 'exam');
  return exam && exam.days >= 0 && exam.days <= settings.daysBefore ? exam : null;
}

/** "today", "tomorrow", "Thursday" within the week, "3 Nov" after: the heading's day. */
export function examDayWord(days: number, date: Date): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return weekdayOf(date).long;
  return formatDayMonth(date);
}

export interface PracticeLinks {
  /** the newest sitting's paper, to practise */
  paper: { slug: string; label: string } | null;
  /** its worked answers (a solution in the same sitting) */
  answers: { slug: string } | null;
  /** its examiners' report */
  report: { slug: string } | null;
}

/** The newest sitting's paper, worked answers and report (each from the first zone that has one). */
export function practiceLinks(sittings: readonly Sitting[]): PracticeLinks {
  const newest = sittings[0];
  if (!newest) return { paper: null, answers: null, report: null };
  const first = <K extends 'papers' | 'solutions' | 'reports'>(k: K) => newest.zones.find((z) => z[k].length)?.[k][0];
  const paper = first('papers');
  const answers = first('solutions');
  const report = first('reports');
  const when = sittingLabel(newest.examYear, newest.session);
  return {
    paper: paper ? { slug: paper.slug, label: when } : null,
    answers: answers ? { slug: answers.slug } : null,
    report: report ? { slug: report.slug } : null,
  };
}

/** The chapter with the most past questions tagged (ties: the earlier in the list), or null with none tagged. */
export function mostAskedChapter(
  questions: readonly PaperQuestion[],
): { chapterId: string; title: string; count: number } | null {
  const counts = new Map<string, { chapterId: string; title: string; count: number }>();
  for (const q of questions) {
    const c = counts.get(q.chapterId) ?? { chapterId: q.chapterId, title: q.chapterTitle, count: 0 };
    c.count += 1;
    counts.set(q.chapterId, c);
  }
  let best: { chapterId: string; title: string; count: number } | null = null;
  for (const c of counts.values()) if (!best || c.count > best.count) best = c;
  return best;
}

/** The module's other dates ahead of `today` (its exam left out), soonest first, at most `n`. */
export function moduleDatesAhead(
  events: readonly CalendarEvent[],
  exam: SessionEvent,
  todayKey: string,
  n = 3,
): CalendarEvent[] {
  if (!exam.moduleId) return [];
  return events
    .filter((e) => e.moduleId === exam.moduleId && e.id !== exam.id && !e.sample && (e.endDate ?? e.date) >= todayKey)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, n);
}
