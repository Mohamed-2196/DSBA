import { useState } from 'react';
import { Plus, RssSimple } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { BREAKPOINTS, cohortLabel, useMediaQuery, useQueryParam, useToast, useYear } from '../../state';
import { Button, ConfirmDialog, cx, Page, PageHeader, PageSection, QueryError, Skeleton } from '../../ui';
import { formatLong, parseDay, today as bahrainToday } from '../../lib/dates';
import { Agenda } from './Agenda';
import { useCalendarEvents, useDeleteEvent } from './api';
import { CalendarToolbar, MONTH_TITLE_ID, TypeFilter } from './CalendarToolbar';
import { monthKey } from './dates';
import { EventDrawer } from './EventDrawer';
import { EventFormDialog } from './EventFormDialog';
import { ContinuesIn, EmptyMonth } from './MonthExtras';
import { MonthGrid } from './MonthGrid';
import { NextUp } from './NextUp';
import { SubscribeDialog } from './SubscribeDialog';
import type { CalendarEvent } from './types';
import { monthOfEvent, useCalendarView } from './useCalendarView';
import './calendar-shared.css';
import './CalendarPage.css';

export default function CalendarPage() {
  const query = useCalendarEvents();
  const { year } = useYear();
  const { can } = useAuth();
  const manages = can('calendar.manage');
  const [subscribing, setSubscribing] = useState(false);
  const [editing, setEditing] = useState<{ event: CalendarEvent | null } | null>(null);

  const description = `Keeps track of everything for ${year ? cohortLabel(year) : 'all three years'}: exams, mocks, revision, deadlines, events and term dates. Add any of them to your own calendar.`;
  const actions = (
    <>
      <Button leadingIcon={RssSimple} onClick={() => setSubscribing(true)} data-hub="calendar-subscribe-open">
        Subscribe
      </Button>
      {manages ? (
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
        <QueryError error={query.error} title="The calendar didn’t load" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <CalendarBody events={query.data} onEdit={manages ? (e) => setEditing({ event: e }) : undefined} onAdd={manages ? () => setEditing({ event: null }) : undefined} />
      )}
      <SubscribeDialog open={subscribing} year={year} onClose={() => setSubscribing(false)} />
      <EventEditor editing={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

/** The add/edit dialog, then the page moves to what was saved. */
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
        push({ tone: 'success', title: created ? 'Event added' : 'Changes saved', body: `${saved.title}, ${formatLong(parseDay(saved.date))}.` });
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
  /** moderators only */
  onEdit?: (e: CalendarEvent) => void;
  onAdd?: () => void;
}

function CalendarBody({ events, onEdit, onAdd }: CalendarBodyProps) {
  const { push } = useToast();
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const remove = useDeleteEvent();
  // Today in Bahrain, read once per visit: relative dates stay the same while the page is open.
  const [today] = useState(() => bahrainToday());
  const view = useCalendarView(events, today);
  const { month, cohortYear, eventId, open, close } = view;
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);

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
    view.setAllYears(true);
    document.getElementById(MONTH_TITLE_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageSection aria-label="Next up">
        <NextUp events={events} year={view.year} today={today} onOpen={open} onShowAllYears={showAllYears} />
      </PageSection>

      <PageSection className="cal-main" aria-labelledby={MONTH_TITLE_ID}>
        <CalendarToolbar view={view} />
        <TypeFilter view={view} />
        <div className={cx('cal-layout', isMobile && 'cal-layout--agenda')}>
          <div className="cal-layout__grid">
            <MonthGrid
              month={month}
              events={view.visible}
              today={today}
              selectedId={eventId}
              showCohort={!cohortYear}
              labelledBy={MONTH_TITLE_ID}
              compact={isMobile}
              onOpen={open}
              onNavigate={view.goMonth}
            />
          </div>
          <Agenda
            month={month}
            events={view.monthEvents}
            today={today}
            selectedId={eventId}
            showCohort={!cohortYear}
            onOpen={open}
            empty={<EmptyMonth view={view} calendarEmpty={!events.length} onAdd={onAdd} />}
            footer={<ContinuesIn view={view} />}
          />
        </div>
      </PageSection>

      <EventDrawer
        event={view.openEvent}
        events={events}
        today={today}
        year={view.year}
        examCount={view.exams.length}
        onClose={close}
        onOpen={view.openAndShow}
        onEdit={onEdit}
        onDelete={
          onEdit
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
              <b>{deleting.title}</b>, {formatLong(parseDay(deleting.date))}, comes off everyone’s calendar and the calendar feed. This can’t be undone.
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
