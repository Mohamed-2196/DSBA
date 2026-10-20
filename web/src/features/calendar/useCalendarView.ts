// What the calendar page shows, from its address: ?cohort=all, ?types=exam,mock, ?view=list|month (the default
// depends on the screen),
// ?month=YYYY-MM (the month grid) and ?event=<id> (the open event; 'mine-<id>' for one of the student's own).
// ?types=mine shows only the student's own events.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryParam, type CohortYear } from '../../state';
import { usePapers } from '../papers/public';
import { addDaysToKey, dayKey } from '../../lib/dates';
import { addMonths, monthKey, monthOfDate, type MonthRef, parseMonthKey, sameMonth } from './dates';
import { isEventType, TYPE_ORDER } from './eventMeta';
import { findEvent as findIn, oneRowPerRepeat } from './mine';
import {
  eventDate,
  filterEvents,
  lastDay,
  nextExamFor,
  upcomingFrom,
  weekAhead,
  weekEnd,
  type NextExam,
} from './queries';
import type { CalendarEvent, EventFilter } from './types';

export const monthOfEvent = (e: CalendarEvent): MonthRef => monthOfDate(eventDate(e));

export type CalendarMode = 'list' | 'month';

const FILTER_ORDER: readonly EventFilter[] = ['mine', 'plan', ...TYPE_ORDER];
const isFilter = (value: string): value is EventFilter => value === 'mine' || value === 'plan' || isEventType(value);

export interface CalendarView {
  /** today in Bahrain, as a day key */
  todayKey: string;
  /** the student's year (null: none picked) */
  year: CohortYear | null;
  /** the student's papers in that year (null: all its modules) */
  papers: ReadonlySet<string> | null;
  /** the student's next exam (every year's without a year) */
  nextExam: NextExam | null;
  /** the student's week ahead, every type */
  week: CalendarEvent[];
  /** the cohort the list and the grid show: the student's year, or null for every year */
  cohortYear: CohortYear | null;
  setAllYears: (all: boolean) => void;
  /** the student has a calendar of their own (signed in): the filters offer it */
  signedIn: boolean;
  /** their plan is on their calendar: the filters offer it */
  showsPlan: boolean;
  /** the types picked, and 'mine' for their own events (none: everything) */
  types: ReadonlySet<EventFilter>;
  toggleType: (type: EventFilter) => void;
  clearTypes: () => void;
  /** the cohort's events of the picked types */
  visible: CalendarEvent[];
  /** the day the list starts on: after the week ahead when the top of the page already lists it, else today */
  listFrom: string;
  /** `visible` from `listFrom` on, in list order; a repeat of the student's own is one row, at its next day */
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

export function useCalendarView(
  events: CalendarEvent[],
  today: Date,
  signedIn = false,
  /** the view without ?view=: the month on laptops and wider, the list on phones and tablets */
  defaultMode: CalendarMode = 'list',
  showsPlan = false,
): CalendarView {
  const { year, papers, resits } = usePapers();
  const [monthParam, setMonthParam] = useQueryParam('month');
  const [cohortParam, setCohortParam] = useQueryParam('cohort', 'mine');
  const [typesParam, setTypesParam] = useQueryParam('types', '');
  const [modeParam, setModeParam] = useQueryParam('view', defaultMode);
  const [eventId, setEventId] = useQueryParam('event');
  const linkedEventRef = useRef(eventId); // a shared ?event= link opens on that event's month

  const todayKey = dayKey(today);
  const cohortYear = year && cohortParam !== 'all' ? year : null;
  const types = useMemo(() => new Set<EventFilter>((typesParam || '').split(',').filter(isFilter)), [typesParam]);
  const shownPapers = cohortYear ? papers : null;
  const visible = useMemo(
    () => filterEvents(events, { year: cohortYear, types, papers: shownPapers, resits }),
    [events, cohortYear, types, shownPapers, resits],
  );
  const findEvent = useCallback((id: string | null) => findIn(events, id, todayKey), [events, todayKey]);
  const openEvent = findEvent(eventId);

  const nextExam = useMemo(
    () => nextExamFor(events, { year, today: todayKey, papers, resits }),
    [events, year, todayKey, papers, resits],
  );
  const week = useMemo(
    () => weekAhead(events, { year, today: todayKey, papers, resits }),
    [events, year, todayKey, papers, resits],
  );
  // The top of the page lists the student's week, every type. When the list shows the same cohort and every type,
  // it starts after that week and leaves out the week's events, so nothing is listed twice.
  const afterWeek = cohortYear === year && types.size === 0;
  const listFrom = afterWeek ? addDaysToKey(weekEnd(todayKey), 1) : todayKey;
  const list = useMemo(() => {
    const upcoming = upcomingFrom(visible, listFrom);
    if (!afterWeek) return oneRowPerRepeat(upcoming);
    const inWeek = new Set(week.map((e) => e.id));
    return oneRowPerRepeat(upcoming.filter((e) => !inWeek.has(e.id)));
  }, [visible, listFrom, afterWeek, week]);

  const defaultMonth = useMemo(() => {
    const linked = findEvent(linkedEventRef.current);
    return linked ? monthOfEvent(linked) : monthOfDate(today);
  }, [today, findEvent]);
  const parsed = parseMonthKey(monthParam);
  const py = parsed?.y;
  const pm = parsed?.m;
  const month = useMemo<MonthRef>(
    () => (py != null && pm != null ? { y: py, m: pm } : defaultMonth),
    [py, pm, defaultMonth],
  );
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
    (type: EventFilter) => {
      const next = new Set(types);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      setTypesParam(FILTER_ORDER.filter((t) => next.has(t)).join(','), { replace: true });
    },
    [types, setTypesParam],
  );
  const clearTypes = useCallback(() => setTypesParam(null, { replace: true }), [setTypesParam]);
  const setAllYears = useCallback(
    (all: boolean) => setCohortParam(all ? 'all' : 'mine', { replace: true }),
    [setCohortParam],
  );
  const setMode = useCallback((m: CalendarMode) => setModeParam(m, { replace: true }), [setModeParam]);

  return {
    todayKey,
    year,
    papers,
    nextExam,
    week,
    cohortYear,
    setAllYears,
    signedIn,
    showsPlan,
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
