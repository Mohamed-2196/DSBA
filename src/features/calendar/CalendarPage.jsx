import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarBlank, CaretLeft, CaretRight, DownloadSimple } from '@phosphor-icons/react';
import { EVENT_TYPES } from '../../data/calendar.js';
import { BREAKPOINTS, cohortColor, cohortLabel, cohortOnColor, useMediaQuery, useQueryParam, useToast, useYear } from '../../state';
import { Button, Chip, cx, EmptyState, IconButton, Page, PageHeader, PageSection, SegmentedControl } from '../../ui';
import { Agenda } from './Agenda.jsx';
import { addMonths, formatDayMonthLong, monthKey, monthName, monthOfDate, monthTitle, parseKey, parseMonthKey, sameMonth, startOfDay } from './dates.js';
import { EventDrawer } from './EventDrawer.jsx';
import { THANKS_EVENT, TYPE_ORDER, typeLabel } from './eventMeta.js';
import { buildIcs, downloadIcs, eventUrl, icsFileName } from './ics.js';
import { MonthGrid } from './MonthGrid.jsx';
import { NextExam } from './NextExam.jsx';
import { filterEvents, getEvent, getUpcomingExams } from './queries.js';
import './calendar-shared.css';
import './CalendarPage.css';

const monthOfEvent = (e) => monthOfDate(parseKey(e.date));

export default function CalendarPage() {
  const { year } = useYear();
  const { push } = useToast();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  // One clock reading per visit: relative dates stay consistent (and the film's frozen clock is respected).
  const [now] = useState(() => new Date());
  const today = useMemo(() => startOfDay(now), [now]);

  const [monthParam, setMonthParam] = useQueryParam('month', null);
  const [cohortParam, setCohortParam] = useQueryParam('cohort', 'mine');
  const [typesParam, setTypesParam] = useQueryParam('types', '');
  const [eventId, setEventId] = useQueryParam('event', null);
  const [forParam] = useQueryParam('for', null);
  const thanks = forParam === 'tutors' ? THANKS_EVENT : null; // hidden Teacher's Day touch
  const linkedEventRef = useRef(eventId); // a shared ?event= link opens on that event's month

  const cohortYear = year && cohortParam !== 'all' ? year : null;
  const types = useMemo(() => new Set((typesParam || '').split(',').filter((t) => EVENT_TYPES[t])), [typesParam]);
  const scoped = useMemo(() => {
    const base = filterEvents({ year: cohortYear });
    return thanks ? [...base, thanks].sort((a, b) => a.date.localeCompare(b.date)) : base;
  }, [cohortYear, thanks]);
  const visible = useMemo(() => (types.size ? scoped.filter((e) => types.has(e.type)) : scoped), [scoped, types]);
  const findEvent = useCallback((id) => (thanks && id === thanks.id ? thanks : getEvent(id)), [thanks]);
  const openEvent = eventId ? findEvent(eventId) : null;

  // Default month: the linked event's month, else this month if it has something, else the month of
  // the next upcoming event, else this month.
  const defaultMonth = useMemo(() => {
    const linked = linkedEventRef.current ? findEvent(linkedEventRef.current) : null;
    if (linked) return monthOfEvent(linked);
    const current = monthOfDate(today);
    if (visible.some((e) => sameMonth(monthOfEvent(e), current))) return current;
    const upcoming = visible.find((e) => parseKey(e.date) >= today);
    return upcoming ? monthOfEvent(upcoming) : current;
  }, [visible, today, findEvent]);
  const parsedMonth = parseMonthKey(monthParam);
  const py = parsedMonth?.y;
  const pm = parsedMonth?.m;
  const month = useMemo(() => (py != null ? { y: py, m: pm } : defaultMonth), [py, pm, defaultMonth]);
  const monthEvents = useMemo(() => visible.filter((e) => sameMonth(monthOfEvent(e), month)), [visible, month]);
  const scopedMonthEvents = useMemo(() => scoped.filter((e) => sameMonth(monthOfEvent(e), month)), [scoped, month]);
  const typeCounts = useMemo(() => {
    const c = {};
    scopedMonthEvents.forEach((e) => {
      c[e.type] = (c[e.type] || 0) + 1;
    });
    return c;
  }, [scopedMonthEvents]);

  const goMonth = useCallback((m) => setMonthParam(monthKey(m), { replace: true }), [setMonthParam]);
  const isCurrentMonth = sameMonth(month, monthOfDate(today));
  // Events opened from the grid, agenda or timeline keep the month in view. An event opened any other
  // way (a ?event= link from search or a notification while this page is open, or another date in the
  // drawer) brings its month into view.
  const openedHere = useRef(null);
  const handledEvent = useRef(eventId);
  const open = useCallback(
    (e) => {
      openedHere.current = e.id;
      setEventId(e.id, { replace: true });
    },
    [setEventId],
  );
  const openAndShow = useCallback((e) => setEventId(e.id, { replace: true }), [setEventId]);
  const close = useCallback(() => setEventId(null, { replace: true }), [setEventId]);
  useEffect(() => {
    if (!eventId || handledEvent.current === eventId) return;
    handledEvent.current = eventId;
    if (openedHere.current === eventId) return;
    const e = findEvent(eventId);
    if (e && !sameMonth(monthOfEvent(e), month)) setMonthParam(monthKey(monthOfEvent(e)), { replace: true });
  }, [eventId, month, setMonthParam, findEvent]);
  const toggleType = (type) => {
    const next = new Set(types);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setTypesParam(TYPE_ORDER.filter((t) => next.has(t)).join(','), { replace: true });
  };

  // Next and previous months that have something to show (for empty months).
  const nextWithEvents = visible.find((e) => parseKey(e.date) > new Date(month.y, month.m + 1, 0));
  const upcomingExams = getUpcomingExams({ year, from: today });

  // ── .ics ─────────────────────────────────────────────────────────────────────────────────────
  const downloadOne = (e) => {
    const name = icsFileName(e);
    const ok = downloadIcs(name, buildIcs([e], { name: 'DSBA Hub', now }));
    push(
      ok
        ? { tone: 'success', title: `Downloaded ${name}`, body: 'Open the file to add it to your calendar.' }
        : { tone: 'alert', title: 'The download didn’t start', body: 'Your browser blocked it. Try again, or use another browser.' },
    );
  };
  const downloadAll = () => {
    if (!upcomingExams.length) {
      push({ tone: 'info', title: `No upcoming exams for ${cohortLabel(year)}`, body: 'There is nothing to download yet.' });
      return;
    }
    const who = year ? cohortLabel(year) : 'All years';
    const name = year ? `dsba-year-${year}-exams.ics` : 'dsba-exams.ics';
    const ok = downloadIcs(name, buildIcs(upcomingExams, { name: `DSBA ${who} exams`, now }));
    const n = upcomingExams.length;
    push(
      ok
        ? { tone: 'success', title: `Downloaded ${n} ${n === 1 ? 'exam' : 'exams'}`, body: `${name} adds every upcoming ${who} exam to your calendar.` }
        : { tone: 'alert', title: 'The download didn’t start', body: 'Your browser blocked it. Try again, or use another browser.' },
    );
  };
  const copyLink = async (e) => {
    try {
      await navigator.clipboard.writeText(eventUrl(e));
      push({ tone: 'success', title: 'Link copied', body: 'Anyone with the link sees this event on the DSBA calendar.' });
    } catch {
      push({ tone: 'alert', title: 'Couldn’t copy the link', body: eventUrl(e) });
    }
  };

  const showAllYears = () => {
    setCohortParam('all', { replace: true });
    document.getElementById('cal-month-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cohortOptions = year
    ? [
        { value: 'mine', label: cohortLabel(year), color: cohortColor(year), onColor: cohortOnColor(year) },
        { value: 'all', label: 'All years' },
      ]
    : null;

  const emptyMonth = (
    <div className="cal-empty">
      <EmptyState
        size="sm"
        icon={CalendarBlank}
        title={`Nothing on the calendar in ${monthName(month)}`}
        body={
          nextWithEvents
            ? `Next up: ${nextWithEvents.title}, ${formatDayMonthLong(parseKey(nextWithEvents.date))}.`
            : types.size
              ? 'No events of the selected types. Show every type to see more.'
              : cohortYear
                ? `Nothing else is scheduled for ${cohortLabel(cohortYear)}.`
                : 'Nothing else is scheduled.'
        }
        action={
          nextWithEvents ? (
            <Button size="sm" onClick={() => goMonth(monthOfEvent(nextWithEvents))}>
              Go to {monthTitle(monthOfEvent(nextWithEvents))}
            </Button>
          ) : types.size ? (
            <Button size="sm" onClick={() => setTypesParam(null, { replace: true })}>Show every type</Button>
          ) : cohortYear ? (
            <Button size="sm" onClick={() => setCohortParam('all', { replace: true })}>Show all years</Button>
          ) : null
        }
      />
    </div>
  );

  const agendaFooter =
    monthEvents.length && nextWithEvents && !sameMonth(monthOfEvent(nextWithEvents), month) ? (
      <button type="button" className="cal-agenda__next" onClick={() => goMonth(monthOfEvent(nextWithEvents))}>
        <span>Continues in {monthName(monthOfEvent(nextWithEvents))}</span>
        <span className="cal-agenda__next-sub">{visible.filter((e) => sameMonth(monthOfEvent(e), monthOfEvent(nextWithEvents))).length} events</span>
        <CaretRight aria-hidden="true" weight="bold" />
      </button>
    ) : null;

  return (
    <Page className="cal-page">
      <PageHeader
        title="Calendar"
        description={`Exams, mocks, revision sessions and term dates${year ? ` for ${cohortLabel(year)}` : ''}. Add any of them to your own calendar.`}
        actions={
          upcomingExams.length ? (
            <Button leadingIcon={DownloadSimple} onClick={downloadAll}>
              Download {year ? `${cohortLabel(year)} exams` : 'all exams'} (.ics)
            </Button>
          ) : null
        }
      />

      <PageSection aria-label="Next exam">
        <NextExam year={year} now={now} onOpen={open} onDownload={downloadOne} onShowAllYears={showAllYears} />
      </PageSection>

      <PageSection className="cal-main" aria-labelledby="cal-month-title">
        <div className="cal-toolbar">
          <div className="cal-toolbar__nav">
            <h2 id="cal-month-title" className="cal-toolbar__title" aria-live="polite">{monthTitle(month)}</h2>
            <div className="cal-toolbar__arrows">
              <IconButton label={`Previous month, ${monthTitle(addMonths(month, -1))}`} icon={CaretLeft} variant="secondary" size="sm" onClick={() => goMonth(addMonths(month, -1))} />
              <IconButton label={`Next month, ${monthTitle(addMonths(month, 1))}`} icon={CaretRight} variant="secondary" size="sm" onClick={() => goMonth(addMonths(month, 1))} />
              <Button size="sm" variant="ghost" onClick={() => goMonth(monthOfDate(today))} disabled={isCurrentMonth}>
                Today
              </Button>
            </div>
          </div>
          {cohortOptions ? (
            <SegmentedControl label="Whose events" size="sm" options={cohortOptions} value={cohortYear ? 'mine' : 'all'} onChange={(v) => setCohortParam(v, { replace: true })} />
          ) : null}
        </div>

        <div className="cal-types" role="group" aria-label="Event types (also the colour key)">
          {TYPE_ORDER.map((type) => (
            <Chip
              key={type}
              size="sm"
              selected={types.has(type)}
              onChange={() => toggleType(type)}
              color={EVENT_TYPES[type].color}
              count={typeCounts[type] || 0}
              className={cx('cal-typechip', `cal-typechip--${type}`, !typeCounts[type] && 'is-empty')}
            >
              {typeLabel(type)}
            </Chip>
          ))}
          {types.size ? (
            <Button size="sm" variant="ghost" onClick={() => setTypesParam(null, { replace: true })}>
              Show every type
            </Button>
          ) : null}
        </div>

        <div className={cx('cal-layout', isMobile && 'cal-layout--agenda')}>
          {!isMobile ? (
            <div className="cal-layout__grid">
              <MonthGrid
                month={month}
                events={visible}
                today={today}
                selectedId={eventId}
                showCohort={!cohortYear}
                labelledBy="cal-month-title"
                onOpen={open}
                onNavigate={goMonth}
              />
            </div>
          ) : null}
          <Agenda
            month={month}
            events={monthEvents}
            today={today}
            selectedId={eventId}
            showCohort={!cohortYear}
            onOpen={open}
            empty={emptyMonth}
            footer={agendaFooter}
          />
        </div>
      </PageSection>

      <EventDrawer
        event={openEvent}
        today={today}
        year={year}
        examCount={upcomingExams.length}
        onClose={close}
        onOpen={openAndShow}
        onDownload={downloadOne}
        onDownloadAll={downloadAll}
        onCopyLink={copyLink}
      />
    </Page>
  );
}
