import { useState } from 'react';
import { Plus, RssSimple } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { cohortLabel, useQueryParam, useToast, useYear } from '../../state';
import { Button, ConfirmDialog, Page, PageHeader, PageSection, QueryError, Skeleton } from '../../ui';
import { formatLong, parseDay, today as bahrainToday } from '../../lib/dates';
import { useCalendarEvents, useDeleteEvent } from './api';
import { Browse } from './Browse';
import { monthKey } from './dates';
import { EventDrawer } from './EventDrawer';
import { EventFormDialog } from './EventFormDialog';
import { ForYou } from './ForYou';
import { SubscribeDialog } from './SubscribeDialog';
import type { CalendarEvent } from './types';
import { monthOfEvent, useCalendarView } from './useCalendarView';
import './calendar-shared.css';
import './CalendarPage.css';

export default function CalendarPage() {
  const query = useCalendarEvents();
  const { year } = useYear();
  const { isModerator } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const [editing, setEditing] = useState<{ event: CalendarEvent | null } | null>(null);

  const description = `Exams, deadlines and term dates for ${year ? cohortLabel(year) : 'all three years'}. Add any of them to your own calendar.`;
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
        <QueryError error={query.error} title="The calendar didn’t load" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <CalendarBody events={query.data} onEdit={isModerator ? (e) => setEditing({ event: e }) : undefined} onAdd={isModerator ? () => setEditing({ event: null }) : undefined} />
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
      <div className="cal-foryou" aria-hidden="true">
        <div className="cal-card">
          <Skeleton width="40%" height={16} />
          <Skeleton width="70%" height={40} style={{ marginTop: 20 }} />
          <Skeleton width="85%" height={20} style={{ marginTop: 14 }} />
          <Skeleton width="45%" height={16} style={{ marginTop: 14 }} />
        </div>
        <div className="cal-card">
          <Skeleton width="30%" height={16} />
          <Skeleton height={56} radius={10} style={{ marginTop: 20 }} />
          <Skeleton height={56} radius={10} style={{ marginTop: 12 }} />
        </div>
      </div>
      <div aria-hidden="true">
        <Skeleton width={180} height={26} />
        <Skeleton height={320} radius={16} style={{ marginTop: 20 }} />
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
  const remove = useDeleteEvent();
  // Today in Bahrain, read once per visit: relative dates stay the same while the page is open.
  const [today] = useState(() => bahrainToday());
  const view = useCalendarView(events, today);
  const { eventId, open, close } = view;
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

  return (
    <>
      <PageSection>
        <ForYou year={view.year} nextExam={view.nextExam} week={view.week} today={today} todayKey={view.todayKey} selectedId={eventId} onOpen={open} />
      </PageSection>

      <PageSection>
        <Browse view={view} today={today} calendarEmpty={!events.length} onAdd={onAdd} />
      </PageSection>

      <EventDrawer
        event={view.openEvent}
        events={events}
        today={today}
        year={view.year}
        hasExams={!!view.nextExam}
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
