import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarBlank, CaretLeft, CaretRight, Plus, RssSimple, WarningCircle } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { BREAKPOINTS, cohortColor, cohortLabel, cohortOnColor, useMediaQuery, useQueryParam, useToast, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Chip, cx, EmptyState, IconButton, Page, PageHeader, PageSection, Panel, SegmentedControl, Skeleton } from '../../ui';
import { Agenda } from './Agenda';
import { useCalendarEvents, useDeleteEvent } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import { addMonths, formatLong, formatLongDay, formatShort, monthKey, monthName, monthOfDate, monthTitle, parseKey, parseMonthKey, sameMonth, startOfDay, type MonthRef } from './dates';
import { EventDrawer } from './EventDrawer';
import { EventFormDialog } from './EventFormDialog';
import { EVENT_TYPES, isEventType, TYPE_ORDER, typeLabel } from './eventMeta';
import { buildIcs, downloadIcs, eventUrl, icsFileName } from './ics';
import { MonthGrid } from './MonthGrid';
import { NextUp } from './NextUp';
import { filterEvents, upcomingExams } from './queries';
import { SubscribeDialog } from './SubscribeDialog';
import type { CalendarEvent, EventType } from './types';
import './calendar-shared.css';
import './CalendarPage.css';

const monthOfEvent = (e: CalendarEvent): MonthRef => monthOfDate(parseKey(e.date));

export default function CalendarPage() {
  const query = useCalendarEvents();
  const { year } = useYear();
  const { isModerator } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const [editing, setEditing] = useState<{ event: CalendarEvent | null } | null>(null);

  const description = `Keeps track of everything for ${year ? cohortLabel(year) : 'all three years'}: exams, mocks, revision, deadlines, events and term dates. Add any of them to your own calendar.`;
  const actions = (
    <>
      <Button leadingIcon={RssSimple} onClick={() => setSubscribing(true)} data-hub="calendar-subscribe-open">
        Subscribe
      </Button>
      {isModerator ? (
        <Button variant="primary" leadingIcon={Plus} onClick={() => setEditing({ event: null })} data-hub="calendar-add">
          Add event
        </Button>
      ) : null}
    </>
  );

  return (
    <Page className="cal-page">
      <PageHeader title="Calendar" description={description} actions={actions} />
      {query.isPending ? (
        <CalendarSkeleton />
      ) : query.isError ? (
        <Panel padding="none">
          <EmptyState
            icon={WarningCircle}
            title="The calendar didn’t load"
            body={errorMessage(query.error, 'Check your connection, then try again.')}
            action={
              <Button onClick={() => void query.refetch()} loading={query.isFetching}>
                Try again
              </Button>
            }
          />
        </Panel>
      ) : (
        <CalendarBody events={query.data} isModerator={isModerator} onEdit={(e) => setEditing({ event: e })} onAdd={() => setEditing({ event: null })} />
      )}
      <SubscribeDialog open={subscribing} year={year} onClose={() => setSubscribing(false)} />
      <EventEditor editing={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

/** The add/edit dialog, plus moving the page to what was saved. */
function EventEditor({ editing, onClose }: { editing: { event: CalendarEvent | null } | null; onClose: () => void }) {
  const { push } = useToast();
  const [, setEventId] = useQueryParam('event');
  const [, setMonthParam] = useQueryParam('month');
  return (
    <EventFormDialog
      open={!!editing}
      event={editing?.event ?? null}
      onClose={onClose}
      onSaved={(saved, created) => {
        onClose();
        setMonthParam(monthKey(monthOfEvent(saved)), { replace: true });
        setEventId(saved.id, { replace: true });
        push({ tone: 'success', title: created ? 'Event added' : 'Changes saved', body: `${saved.title}, ${formatLong(parseKey(saved.date))}.` });
      }}
    />
  );
}

function CalendarSkeleton() {
  return (
    <div className="cal-skeleton" aria-busy="true">
      <span className="visually-hidden">Loading the calendar</span>
      <div className="cal-next" aria-hidden="true">
        <Skeleton width="38%" height={18} />
        <Skeleton width="72%" height={64} style={{ marginTop: 16 }} />
        <Skeleton width="48%" height={26} style={{ marginTop: 16 }} />
        <Skeleton height={86} radius={12} style={{ marginTop: 28 }} />
      </div>
      <div className="cal-skeleton__month" aria-hidden="true">
        <Skeleton width={220} height={30} />
        <Skeleton height={420} radius={16} style={{ marginTop: 20 }} />
      </div>
    </div>
  );
}

interface CalendarBodyProps {
  events: CalendarEvent[];
  isModerator: boolean;
  onEdit: (e: CalendarEvent) => void;
  onAdd: () => void;
}

function CalendarBody({ events, isModerator, onEdit, onAdd }: CalendarBodyProps) {
  const { year } = useYear();
  const { push } = useToast();
  const { getModule } = useModules();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const remove = useDeleteEvent();
  // One clock reading per visit: relative dates stay consistent while the page is open.
  const [now] = useState(() => new Date());
  const today = useMemo(() => startOfDay(now), [now]);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);

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

  // Default month: the linked event's month, else this month if it has something, else the month of
  // the next upcoming event, else this month.
  const defaultMonth = useMemo(() => {
    const linked = findEvent(linkedEventRef.current);
    if (linked) return monthOfEvent(linked);
    const current = monthOfDate(today);
    if (visible.some((e) => sameMonth(monthOfEvent(e), current))) return current;
    const upcoming = visible.find((e) => parseKey(e.date) >= today);
    return upcoming ? monthOfEvent(upcoming) : current;
  }, [visible, today, findEvent]);
  const parsedMonth = parseMonthKey(monthParam);
  const py = parsedMonth?.y;
  const pm = parsedMonth?.m;
  const month = useMemo<MonthRef>(() => (py != null && pm != null ? { y: py, m: pm } : defaultMonth), [py, pm, defaultMonth]);
  const monthEvents = useMemo(() => visible.filter((e) => sameMonth(monthOfEvent(e), month)), [visible, month]);
  const scopedMonthEvents = useMemo(() => scoped.filter((e) => sameMonth(monthOfEvent(e), month)), [scoped, month]);
  const typeCounts = useMemo(() => {
    const c: Partial<Record<EventType, number>> = {};
    scopedMonthEvents.forEach((e) => {
      c[e.type] = (c[e.type] ?? 0) + 1;
    });
    return c;
  }, [scopedMonthEvents]);

  const goMonth = useCallback((m: MonthRef) => setMonthParam(monthKey(m), { replace: true }), [setMonthParam]);
  const isCurrentMonth = sameMonth(month, monthOfDate(today));
  // Events opened from the grid, the agenda or the cards at the top keep the month in view. An event
  // opened any other way (a ?event= link from search or a notification while this page is open, or
  // another date in the drawer) brings its month into view.
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
  const toggleType = (type: EventType) => {
    const next = new Set(types);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setTypesParam(TYPE_ORDER.filter((t) => next.has(t)).join(','), { replace: true });
  };

  // Next and previous months that have something to show (for empty months).
  const nextWithEvents = visible.find((e) => parseKey(e.date) > new Date(month.y, month.m + 1, 0));
  const exams = useMemo(() => upcomingExams(events, { year, from: today }), [events, year, today]);

  // ── .ics ─────────────────────────────────────────────────────────────────────────────────────
  const downloadOne = (e: CalendarEvent) => {
    const name = icsFileName(e);
    const ok = downloadIcs(name, buildIcs([e], getModule, { name: 'DSBA Hub', now }));
    push(
      ok
        ? { tone: 'success', title: `Downloaded ${name}`, body: `${formatLong(parseKey(e.date))}. Open the file to add it to your calendar.` }
        : { tone: 'alert', title: 'The download didn’t start', body: 'Your browser blocked it. Try again, or use another browser.' },
    );
  };
  const downloadAll = () => {
    const first = exams[0];
    const last = exams[exams.length - 1];
    if (!first || !last) {
      push({ tone: 'info', title: `No upcoming exams for ${cohortLabel(year)}`, body: 'There is nothing to download yet.' });
      return;
    }
    const who = year ? cohortLabel(year) : 'All years';
    const name = year ? `dsba-year-${year}-exams.ics` : 'dsba-exams.ics';
    const ok = downloadIcs(name, buildIcs(exams, getModule, { name: `DSBA ${who} exams`, now }));
    const n = exams.length;
    const from = formatShort(parseKey(first.date));
    const to = formatShort(parseKey(last.date));
    push(
      ok
        ? {
            tone: 'success',
            title: `Downloaded ${n} ${n === 1 ? 'exam' : 'exams'}`,
            body: `${name} adds every upcoming ${who} exam to your calendar${n === 1 ? ` (${from})` : `, ${from} to ${to}`}.`,
          }
        : { tone: 'alert', title: 'The download didn’t start', body: 'Your browser blocked it. Try again, or use another browser.' },
    );
  };
  const copyLink = async (e: CalendarEvent) => {
    try {
      await navigator.clipboard.writeText(eventUrl(e));
      push({ tone: 'success', title: 'Link copied', body: 'Anyone with the link sees this event on the DSBA calendar.' });
    } catch {
      push({ tone: 'alert', title: 'Couldn’t copy the link', body: eventUrl(e) });
    }
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const gone = deleting;
    remove.mutate(gone.id, {
      onSuccess: () => {
        setDeleting(null);
        if (eventId === gone.id) close();
        push({ tone: 'success', title: 'Event deleted', body: `${gone.title} is off the calendar.` });
      },
    });
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
            ? `Next up: ${nextWithEvents.title}, ${formatLongDay(parseKey(nextWithEvents.date))}.`
            : types.size
              ? 'No events of the selected types. Show every type to see more.'
              : !events.length
                ? isModerator
                  ? 'The calendar is empty. Add the first date for everyone.'
                  : 'Dates show up here as soon as they’re announced.'
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
            <Button size="sm" onClick={() => setTypesParam(null, { replace: true })}>
              Show every type
            </Button>
          ) : !events.length && isModerator ? (
            <Button size="sm" variant="primary" leadingIcon={Plus} onClick={onAdd}>
              Add event
            </Button>
          ) : cohortYear ? (
            <Button size="sm" onClick={() => setCohortParam('all', { replace: true })}>
              Show all years
            </Button>
          ) : null
        }
      />
    </div>
  );

  const nextMonthCount = nextWithEvents ? visible.filter((e) => sameMonth(monthOfEvent(e), monthOfEvent(nextWithEvents))).length : 0;
  const agendaFooter =
    monthEvents.length && nextWithEvents && !sameMonth(monthOfEvent(nextWithEvents), month) ? (
      <button type="button" className="cal-agenda__next" onClick={() => goMonth(monthOfEvent(nextWithEvents))}>
        <span>Continues in {monthName(monthOfEvent(nextWithEvents))}</span>
        <span className="cal-agenda__next-sub">
          {nextMonthCount} {nextMonthCount === 1 ? 'event' : 'events'}
        </span>
        <CaretRight aria-hidden="true" weight="bold" />
      </button>
    ) : null;

  return (
    <>
      <PageSection aria-label="Next up">
        <NextUp events={events} year={year} now={now} onOpen={open} onDownload={downloadOne} onShowAllYears={showAllYears} />
      </PageSection>

      <PageSection className="cal-main" aria-labelledby="cal-month-title">
        <div className="cal-toolbar">
          <div className="cal-toolbar__nav">
            <h2 id="cal-month-title" className="cal-toolbar__title" aria-live="polite">
              {monthTitle(month)}
            </h2>
            <div className="cal-toolbar__arrows">
              <IconButton label={`Previous month, ${monthTitle(addMonths(month, -1))}`} icon={CaretLeft} variant="secondary" size="sm" onClick={() => goMonth(addMonths(month, -1))} />
              <IconButton label={`Next month, ${monthTitle(addMonths(month, 1))}`} icon={CaretRight} variant="secondary" size="sm" onClick={() => goMonth(addMonths(month, 1))} />
              <Button size="sm" variant="ghost" onClick={() => goMonth(monthOfDate(today))} disabled={isCurrentMonth}>
                Today
              </Button>
            </div>
          </div>
          {cohortOptions ? (
            <SegmentedControl label="Whose events" size="sm" options={cohortOptions} value={cohortYear ? 'mine' : 'all'} onChange={(v) => setCohortParam(String(v), { replace: true })} />
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
              count={typeCounts[type] ?? 0}
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
              <MonthGrid month={month} events={visible} today={today} selectedId={eventId} showCohort={!cohortYear} labelledBy="cal-month-title" onOpen={open} onNavigate={goMonth} />
            </div>
          ) : null}
          <Agenda month={month} events={monthEvents} today={today} selectedId={eventId} showCohort={!cohortYear} onOpen={open} empty={emptyMonth} footer={agendaFooter} />
        </div>
      </PageSection>

      <EventDrawer
        event={openEvent}
        events={events}
        today={today}
        year={year}
        examCount={exams.length}
        onClose={close}
        onOpen={openAndShow}
        onDownload={downloadOne}
        onDownloadAll={downloadAll}
        onCopyLink={(e) => void copyLink(e)}
        onEdit={isModerator ? onEdit : undefined}
        onDelete={
          isModerator
            ? (e) => {
                remove.reset();
                setDeleting(e);
              }
            : undefined
        }
      />
      <ConfirmDialog
        open={!!deleting}
        title="Delete this event?"
        body={
          deleting ? (
            <p>
              <b>{deleting.title}</b>, {formatLong(parseKey(deleting.date))}, comes off everyone’s calendar and the calendar feed. This can’t be undone.
            </p>
          ) : null
        }
        confirmLabel="Delete event"
        tone="danger"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, 'The event wasn’t deleted. Try again.') : null}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
