// Dates on the calendar that concern modules (the calendar feature's public hooks), with display strings. Days count
// from today in Bahrain, as the API counts them (src/lib/dates.ts).
import { useMemo } from 'react';
import { daysUntil, formatDay, inDays, parseDay, today, todayKey, weekdayOf, type DayInput } from '../../lib/dates';
import { useAuth } from '../../auth';
import { useCalendarEvents, type CalendarEvent } from '../calendar/public';
import { resitFor, usePapers } from '../papers/public';

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

/**
 * What a module's page and its row say about its exams, for a student of `viewer` (their year; null: the module's
 * own) resitting the modules in `resits`: the sitting that counts down for them (`next`: the module's next main
 * sitting, or a resit that is theirs, whichever comes first; never the resit of the module's own year), and a resit
 * ahead that isn't theirs (`otherResit`, said quietly on the module's page). `exams`: the module's exams from today,
 * oldest first.
 */
export interface ModuleSittings {
  next: ExamInfo | null;
  otherResit: ExamInfo | null;
}

export function moduleSittings(
  exams: readonly CalendarEvent[],
  viewer: number | null,
  resits: ReadonlySet<string>,
  from: DayInput = today(),
): ModuleSittings {
  let next: CalendarEvent | null = null;
  let otherResit: CalendarEvent | null = null;
  for (const e of exams) {
    if (e.type !== 'exam') continue;
    const theirs = !e.resit || resitFor(e, viewer ?? e.year, resits);
    if (theirs) next ??= e;
    else otherResit ??= e;
  }
  return { next: examInfo(next, from), otherResit: examInfo(otherResit, from) };
}

/**
 * The module's sittings for the student (moduleSittings: their own year, or the one a guest chose), with `loaded`
 * once the calendar has answered. Nothing while loading, on errors and with no exam ahead.
 */
export function useModuleExam(moduleId: string): ModuleSittings & { loaded: boolean } {
  const from = todayKey();
  const q = useCalendarEvents({ from, moduleId, type: 'exam' }, { enabled: useAuth().featureOn('calendar') });
  const { home, resits } = usePapers();
  return useMemo(
    () => ({ ...moduleSittings(q.data ?? [], home, resits), loaded: q.isSuccess }),
    [q.data, q.isSuccess, home, resits],
  );
}

/** Every module's sittings for the student, in one request: moduleId → its sittings (moduleSittings). */
export function useExamsByModule(): Map<string, ModuleSittings> {
  const from = todayKey();
  const q = useCalendarEvents({ from, type: 'exam' }, { enabled: useAuth().featureOn('calendar') });
  const { home, resits } = usePapers();
  return useMemo(() => {
    const byModule = new Map<string, CalendarEvent[]>();
    for (const e of q.data ?? []) {
      if (!e.moduleId) continue;
      const list = byModule.get(e.moduleId) ?? [];
      list.push(e);
      byModule.set(e.moduleId, list);
    }
    const out = new Map<string, ModuleSittings>();
    for (const [id, exams] of byModule) out.set(id, moduleSittings(exams, home, resits));
    return out;
  }, [q.data, home, resits]);
}

/** The module's dates from today on, and those still running today (exams, mocks, revision sessions, deadlines,
 *  VLE windows), oldest first. */
export function useModuleDates(moduleId: string, n = 4) {
  const from = todayKey();
  const q = useCalendarEvents({ from, moduleId }, { enabled: useAuth().featureOn('calendar') });
  const events = useMemo(() => (q.data ?? []).slice(0, n), [q.data, n]);
  return {
    events,
    isPending: q.isPending,
    isError: q.isError,
    error: q.error,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
}
