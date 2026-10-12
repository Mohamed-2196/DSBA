// What the calendar page shows, from its address: ?month=YYYY-MM, ?cohort=all, ?types=exam,mock and ?event=<id>.
// Split out of CalendarPage (code quality review CQ-17).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryParam, useYear, type CohortYear } from '../../state';
import { parseDay } from '../../lib/dates';
import { addMonths, monthKey, monthOfDate, type MonthRef, parseMonthKey, sameMonth } from './dates';
import { isEventType, TYPE_ORDER } from './eventMeta';
import { filterEvents, upcomingExams } from './queries';
import type { CalendarEvent, EventType } from './types';

export const monthOfEvent = (e: CalendarEvent): MonthRef => monthOfDate(parseDay(e.date));

export interface CalendarView {
  /** the student's year (null: none picked) */
  year: CohortYear | null;
  /** the cohort shown: the student's year, or null for every year */
  cohortYear: CohortYear | null;
  setAllYears: (all: boolean) => void;
  /** the types picked (none: every type) */
  types: ReadonlySet<EventType>;
  toggleType: (type: EventType) => void;
  clearTypes: () => void;
  /** the cohort's events, every type */
  scoped: CalendarEvent[];
  /** the cohort's events of the picked types */
  visible: CalendarEvent[];
  month: MonthRef;
  /** `visible`, this month */
  monthEvents: CalendarEvent[];
  /** how many of the cohort's events of each type this month (for the chips) */
  typeCounts: Partial<Record<EventType, number>>;
  isCurrentMonth: boolean;
  goMonth: (m: MonthRef) => void;
  goToday: () => void;
  /** the first visible event after this month, for empty months and "Continues in …" */
  nextWithEvents: CalendarEvent | null;
  /** upcoming exams of the student's year (every year without one) */
  exams: CalendarEvent[];
  eventId: string | null;
  openEvent: CalendarEvent | null;
  /** open an event from what is on screen: the month stays */
  open: (e: CalendarEvent) => void;
  /** open an event from elsewhere (the drawer's lists): its month comes into view */
  openAndShow: (e: CalendarEvent) => void;
  close: () => void;
}

export function useCalendarView(events: CalendarEvent[], today: Date): CalendarView {
  const { year } = useYear();
  const [monthParam, setMonthParam] = useQueryParam('month');
  const [cohortParam, setCohortParam] = useQueryParam('cohort', 'mine');
  const [typesParam, setTypesParam] = useQueryParam('types', '');
  const [eventId, setEventId] = useQueryParam('event');
  const linkedEventRef = useRef(eventId); // a shared ?event= link opens on that event's month

  const cohortYear = year && cohortParam !== 'all' ? year : null;
  const types = useMemo(() => new Set<EventType>((typesParam || '').split(',').filter(isEventType)), [typesParam]);
  const scoped = useMemo(() => filterEvents(events, { year: cohortYear }), [events, cohortYear]);
  const visible = useMemo(() => (types.size ? scoped.filter((e) => types.has(e.type)) : scoped), [scoped, types]);
  const findEvent = useCallback((id: string | null) => (id ? (events.find((e) => e.id === id) ?? null) : null), [events]);
  const openEvent = findEvent(eventId);

  // The month without ?month=: the linked event's month, else this month if it has something, else the month of
  // the next upcoming event, else this month.
  const defaultMonth = useMemo(() => {
    const linked = findEvent(linkedEventRef.current);
    if (linked) return monthOfEvent(linked);
    const current = monthOfDate(today);
    if (visible.some((e) => sameMonth(monthOfEvent(e), current))) return current;
    const upcoming = visible.find((e) => parseDay(e.date) >= today);
    return upcoming ? monthOfEvent(upcoming) : current;
  }, [visible, today, findEvent]);
  const parsed = parseMonthKey(monthParam);
  const py = parsed?.y;
  const pm = parsed?.m;
  const month = useMemo<MonthRef>(() => (py != null && pm != null ? { y: py, m: pm } : defaultMonth), [py, pm, defaultMonth]);
  const monthEvents = useMemo(() => visible.filter((e) => sameMonth(monthOfEvent(e), month)), [visible, month]);
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<EventType, number>> = {};
    for (const e of scoped) if (sameMonth(monthOfEvent(e), month)) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return counts;
  }, [scoped, month]);

  const goMonth = useCallback((m: MonthRef) => setMonthParam(monthKey(m), { replace: true }), [setMonthParam]);
  const goToday = useCallback(() => goMonth(monthOfDate(today)), [goMonth, today]);

  // Events opened from the grid, the agenda or the cards at the top keep the month in view. An event opened any
  // other way (a ?event= link from search or a notification while this page is open, or another date in the
  // drawer) brings its month into view.
  const openedHere = useRef<string | null>(null);
  const handledEvent = useRef(eventId);
  const open = useCallback(
    (e: CalendarEvent) => {
      openedHere.current = e.id;
      setEventId(e.id, { replace: true });
    },
    [setEventId],
  );
  const openAndShow = useCallback((e: CalendarEvent) => setEventId(e.id, { replace: true }), [setEventId]);
  const close = useCallback(() => setEventId(null, { replace: true }), [setEventId]);
  useEffect(() => {
    if (!eventId || handledEvent.current === eventId) return;
    handledEvent.current = eventId;
    if (openedHere.current === eventId) return;
    const e = findEvent(eventId);
    if (e && !sameMonth(monthOfEvent(e), month)) setMonthParam(monthKey(monthOfEvent(e)), { replace: true });
  }, [eventId, month, setMonthParam, findEvent]);

  const toggleType = useCallback(
    (type: EventType) => {
      const next = new Set(types);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      setTypesParam(TYPE_ORDER.filter((t) => next.has(t)).join(','), { replace: true });
    },
    [types, setTypesParam],
  );
  const clearTypes = useCallback(() => setTypesParam(null, { replace: true }), [setTypesParam]);
  const setAllYears = useCallback((all: boolean) => setCohortParam(all ? 'all' : 'mine', { replace: true }), [setCohortParam]);

  const after = addMonths(month, 1);
  const firstOfNext = new Date(after.y, after.m, 1);
  const nextWithEvents = visible.find((e) => parseDay(e.date) >= firstOfNext) ?? null;
  const exams = useMemo(() => upcomingExams(events, { year, from: today }), [events, year, today]);

  return {
    year,
    cohortYear,
    setAllYears,
    types,
    toggleType,
    clearTypes,
    scoped,
    visible,
    month,
    monthEvents,
    typeCounts,
    isCurrentMonth: sameMonth(month, monthOfDate(today)),
    goMonth,
    goToday,
    nextWithEvents,
    exams,
    eventId,
    openEvent,
    open,
    openAndShow,
    close,
  };
}
