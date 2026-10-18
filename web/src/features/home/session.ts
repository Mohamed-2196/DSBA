// The exam session ahead, for Home's Coming up (pure).
import type { ModuleSummary } from '../../api/types';
import type { CalendarEvent } from '../calendar/public';
import { daysBetween, parseDay, today as bahrainToday } from '../../lib/dates';
import { isMine } from '../papers/public';

const EXAM_TYPES = new Set(['exam', 'mock']);

/** A calendar date as Coming up uses it: how far away, which module, which day. */
export interface SessionEvent extends CalendarEvent {
  days: number;
  module: ModuleSummary | null;
  when: Date;
}

export interface ExamSession {
  today: Date;
  next: SessionEvent;
  exams: SessionEvent[];
  kind: 'exams' | 'event';
}

/**
 * The next exam (or mock) for a year (and the student's `papers` in it, when picked) within `horizon` days of `today` (Bahrain's, at local midnight), plus the exams that follow it with gaps ≤ `maxGap`
 * days (one "session"). Falls back to the next other date (break, deadline…) within 60 days. null when the calendar has nothing ahead.
 * Home counts down to confirmed dates only: sample dates (placeholders, `sample: true`) and programme events
 * stay on the Calendar page.
 */
export function getExamSession(
  events: readonly CalendarEvent[],
  year: number,
  getModule: (id: string | null | undefined) => ModuleSummary | null,
  today: Date = bahrainToday(),
  {
    horizon = 120,
    maxGap = 21,
    papers = null,
  }: { horizon?: number; maxGap?: number; papers?: ReadonlySet<string> | null } = {},
): ExamSession | null {
  const upcoming: SessionEvent[] = events
    .filter((e) => isMine(e, year, papers) && !e.sample && e.type !== 'event' && e.type !== 'careers')
    .map((e) => {
      const when = parseDay(e.date);
      return { ...e, days: daysBetween(today, when), module: getModule(e.moduleId), when };
    })
    .filter((e) => e.days >= 0 && e.days <= horizon)
    .sort((a, b) => a.days - b.days);
  const exams = upcoming.filter((e) => EXAM_TYPES.has(e.type));
  const first = exams[0];
  if (first) {
    const session = [first];
    for (const e of exams.slice(1)) {
      const last = session[session.length - 1] as SessionEvent;
      if (e.days - last.days > maxGap) break;
      session.push(e);
    }
    return { today, next: first, exams: session, kind: 'exams' };
  }
  const other = upcoming.find((e) => e.days <= 60);
  if (other) return { today, next: other, exams: [other], kind: 'event' };
  return null;
}
