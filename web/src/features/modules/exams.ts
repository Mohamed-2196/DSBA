// Dates on the calendar that concern modules (the calendar feature's public hooks), with display strings. Days count
// from today in Bahrain, as the API counts them (src/lib/dates.ts).
import { useMemo } from 'react';
import { daysUntil, formatDay, inDays, parseDay, today, todayKey, weekdayOf, type DayInput } from '../../lib/dates';
import type { CohortYear } from '../../state';
import { useAuth } from '../../auth';
import { useCalendarEvents, useNextExamForModule, type CalendarEvent } from '../calendar/public';

export interface ExamInfo {
  event: CalendarEvent;
  days: number;
  /** '30 Oct' */
  date: string;
  /** 'Fri 30 Oct' */
  weekdayDate: string;
  /** 'Friday' */
  weekday: string;
  /** 'today', 'tomorrow', 'in 24 days' */
  relative: string;
  /** Within two weeks. */
  soon: boolean;
}

/** What the module pages show about an exam, counted from `from` (today in Bahrain). */
export function examInfo(event: CalendarEvent | null | undefined, from: DayInput = today()): ExamInfo | null {
  if (!event) return null;
  const days = daysUntil(event.date, from);
  return {
    event,
    days,
    date: formatDay(event.date, { month: 'short', year: false }),
    weekdayDate: formatDay(event.date, { weekday: 'short', month: 'short', year: false }),
    weekday: weekdayOf(parseDay(event.date)).long,
    relative: inDays(days),
    soon: days <= 14,
  };
}

/** The module's next exam (null while loading, on errors and when none is on the calendar). */
export function useModuleExam(moduleId: string): ExamInfo | null {
  const q = useNextExamForModule(moduleId, { enabled: useAuth().featureOn('calendar') });
  return useMemo(() => examInfo(q.data), [q.data]);
}

/** The next exam of every module of a cohort, in one request: moduleId → exam. */
export function useExamsByModule(year: CohortYear | null): Map<string, ExamInfo> {
  const from = todayKey();
  const q = useCalendarEvents({ from, type: 'exam', year }, { enabled: useAuth().featureOn('calendar') });
  return useMemo(() => {
    const out = new Map<string, ExamInfo>();
    for (const e of q.data ?? []) {
      if (e.moduleId && !out.has(e.moduleId)) {
        const info = examInfo(e);
        if (info) out.set(e.moduleId, info);
      }
    }
    return out;
  }, [q.data]);
}

/** The module's dates from today on, and those still running today (exams, mocks, revision sessions, deadlines,
 *  VLE windows), oldest first. */
export function useModuleDates(moduleId: string, n = 4) {
  const from = todayKey();
  const q = useCalendarEvents({ from, moduleId }, { enabled: useAuth().featureOn('calendar') });
  const events = useMemo(() => (q.data ?? []).slice(0, n), [q.data, n]);
  return { events, isPending: q.isPending, isError: q.isError, error: q.error, isFetching: q.isFetching, refetch: q.refetch };
}
