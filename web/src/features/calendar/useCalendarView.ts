// What the calendar page shows, from its address: ?cohort=all, ?types=exam,mock, ?view=month (phones and tablets),
// ?month=YYYY-MM (the month grid) and ?event=<id> (the open event).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryParam, useYear, type CohortYear } from '../../state';
import { addDaysToKey, dayKey } from '../../lib/dates';
import { addMonths, monthKey, monthOfDate, type MonthRef, parseMonthKey, sameMonth } from './dates';
import { isEventType, TYPE_ORDER } from './eventMeta';
import { eventDate, filterEvents, lastDay, nextExamFor, upcomingFrom, weekAhead, weekEnd, type NextExam } from './queries';
import type { CalendarEvent, EventType } from './types';

export const monthOfEvent = (e: CalendarEvent): MonthRef => monthOfDate(eventDate(e));

export type CalendarMode = 'list' | 'month';

export interface CalendarView {
  /** today in Bahrain, as a day key */
  todayKey: string;
  /** the student's year (null: none picked) */
  year: CohortYear | null;
  /** the student's next exam (every year's without a year) */
  nextExam: NextExam | null;
  /** the student's week ahead, every type */
  week: CalendarEvent[];
  /** the cohort the list and the grid show: the student's year, or null for every year */
  cohortYear: CohortYear | null;
  setAllYears: (all: boolean) => void;
  /** the types picked (none: every type) */
  types: ReadonlySet<EventType>;
  toggleType: (type: EventType) => void;
  clearTypes: () => void;
  /** the cohort's events of the picked types */
  visible: CalendarEvent[];
  /** the day the list starts on: after the week ahead when the top of the page already lists it, else today */
  listFrom: string;
  /** `visible` from `listFrom` on, in list order */
  list: CalendarEvent[];
  /** phones and tablets: the list or the month */
  mode: CalendarMode;
  setMode: (mode: CalendarMode) => void;
  month: MonthRef;
  /** `visible` in the month on show, including events that run into it */
  monthEvents: CalendarEvent[];
  isCurrentMonth: boolean;
  goMonth: (m: MonthRef) => void;
  goToday: () => void;
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
  const [modeParam, setModeParam] = useQueryParam('view', 'list');
  const [eventId, setEventId] = useQueryParam('event');
  const linkedEventRef = useRef(eventId); // a shared ?event= link opens on that event's month

  const todayKey = dayKey(today);
  const cohortYear = year && cohortParam !== 'all' ? year : null;
  const types = useMemo(() => new Set<EventType>((typesParam || '').split(',').filter(isEventType)), [typesParam]);
  const visible = useMemo(() => filterEvents(events, { year: cohortYear, types }), [events, cohortYear, types]);
  const findEvent = useCallback((id: string | null) => (id ? (events.find((e) => e.id === id) ?? null) : null), [events]);
  const openEvent = findEvent(eventId);

  const nextExam = useMemo(() => nextExamFor(events, { year, today: todayKey }), [events, year, todayKey]);
  const week = useMemo(() => weekAhead(events, { year, today: todayKey }), [events, year, todayKey]);
  // The top of the page lists the student's week, every type. When the list shows the same cohort and every type,
  // it starts after that week, so nothing is listed twice.
  const listFrom = cohortYear === year && types.size === 0 ? addDaysToKey(weekEnd(todayKey), 1) : todayKey;
  const list = useMemo(() => upcomingFrom(visible, listFrom), [visible, listFrom]);

  const defaultMonth = useMemo(() => {
    const linked = findEvent(linkedEventRef.current);
    return linked ? monthOfEvent(linked) : monthOfDate(today);
  }, [today, findEvent]);
  const parsed = parseMonthKey(monthParam);
  const py = parsed?.y;
  const pm = parsed?.m;
  const month = useMemo<MonthRef>(() => (py != null && pm != null ? { y: py, m: pm } : defaultMonth), [py, pm, defaultMonth]);
  const monthEvents = useMemo(() => {
    const first = `${monthKey(month)}-01`;
    const next = `${monthKey(addMonths(month, 1))}-01`;
    return visible.filter((e) => e.date < next && lastDay(e) >= first);
  }, [visible, month]);

  const goMonth = useCallback((m: MonthRef) => setMonthParam(monthKey(m), { replace: true }), [setMonthParam]);
  const goToday = useCallback(() => goMonth(monthOfDate(today)), [goMonth, today]);

  // Events opened from the list, the grid or the top of the page keep the month in view. An event opened any
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
  const setMode = useCallback((m: CalendarMode) => setModeParam(m, { replace: true }), [setModeParam]);

  return {
    todayKey,
    year,
    nextExam,
    week,
    cohortYear,
    setAllYears,
    types,
    toggleType,
    clearTypes,
    visible,
    listFrom,
    list,
    mode: modeParam === 'month' ? 'month' : 'list',
    setMode,
    month,
    monthEvents,
    isCurrentMonth: sameMonth(month, monthOfDate(today)),
    goMonth,
    goToday,
    eventId,
    openEvent,
    open,
    openAndShow,
    close,
  };
}
