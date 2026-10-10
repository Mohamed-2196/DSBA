// Dates on the calendar that concern modules (the calendar feature's public hooks), with display strings.
import { useMemo } from 'react';
import { formatDate } from '../../ui';
import { daysUntil, useCalendarEvents, useNextExamForModule, type CalendarEvent } from '../calendar/public';
import type { CohortYear } from '../../lib/modules';

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

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as 'YYYY-MM-DD' (local), the way the calendar counts days. */
export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function examInfo(event: CalendarEvent | null | undefined, now = new Date()): ExamInfo | null {
  if (!event) return null;
  const days = daysUntil(event.date, now);
  return {
    event,
    days,
    date: formatDate(event.date, { day: 'numeric', month: 'short' }),
    weekdayDate: `${formatDate(event.date, { weekday: 'short' })} ${formatDate(event.date, { day: 'numeric', month: 'short' })}`,
    weekday: formatDate(event.date, { weekday: 'long' }),
    relative: days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`,
    soon: days <= 14,
  };
}

/** The module's next exam (null while loading, on errors and when none is on the calendar). */
export function useModuleExam(moduleId: string): ExamInfo | null {
  const q = useNextExamForModule(moduleId);
  return useMemo(() => examInfo(q.data), [q.data]);
}

/** The next exam of every module of a cohort, in one request: moduleId → exam. */
export function useExamsByModule(year: CohortYear | null): Map<string, ExamInfo> {
  const from = todayKey();
  const q = useCalendarEvents({ from, type: 'exam', year });
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

/** The module's dates from today on (exams, mocks, revision sessions, deadlines), oldest first. */
export function useModuleDates(moduleId: string, n = 4) {
  const from = todayKey();
  const q = useCalendarEvents({ from, moduleId });
  const events = useMemo(() => (q.data ?? []).slice(0, n), [q.data, n]);
  return { events, isPending: q.isPending, isError: q.isError, refetch: q.refetch };
}
