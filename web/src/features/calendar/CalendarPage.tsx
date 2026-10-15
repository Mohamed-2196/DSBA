import { useMemo, useState } from 'react';
import { CalendarPlus, Plus, RssSimple, SlidersHorizontal } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { cohortLabel, useQueryParam, useToast, useYear } from '../../state';
import { Button, ConfirmDialog, Page, PageHeader, PageSection, QueryError, Skeleton } from '../../ui';
import { formatLong, parseDay, todayKey, today as bahrainToday } from '../../lib/dates';
import { useCalendarEvents, useDeleteEvent, useDeleteMyEvent } from './api';
import { Browse } from './Browse';
import { CustomiseDialog } from './CustomiseDialog';
import { monthKey } from './dates';
import { EventDrawer } from './EventDrawer';
import { EventFormDialog, type DateNotice } from './EventFormDialog';
import { typeLabel } from './eventMeta';
import { ForYou } from './ForYou';
import { myCalendar, occurrenceId } from './mine';
import { MyEventDialog } from './MyEventDialog';
import { useEmployers } from '../career/public';
import { PapersDialog, usePapers } from '../papers/public';
import { SubscribeDialog } from './SubscribeDialog';
import type { CalendarEvent, PersonalEvent } from './types';
import { monthOfEvent, useCalendarView } from './useCalendarView';
import { useMyCalendar, type HiddenKind, type MyCalendar } from './useMyCalendar';
import './calendar-shared.css';
import './CalendarPage.css';

export default function CalendarPage() {
  const query = useCalendarEvents();
  const { year } = useYear();
  const { papers } = usePapers();
  const { can, featureOn, requireAuth } = useAuth();
  const manages = can('calendar.manage');
  const employers = useEmployers(featureOn('career'));
  const my = useMyCalendar();
  const [subscribing, setSubscribing] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [pickingPapers, setPickingPapers] = useState(false);
  const [editing, setEditing] = useState<{ event: CalendarEvent | null } | null>(null);
  const [editingMine, setEditingMine] = useState<{ event: PersonalEvent | null } | null>(null);
  const events = useMemo(() => (query.data ? myCalendar(query.data, my.events, my.prefs) : []), [query.data, my.events, my.prefs]);

  const description = `Exams, deadlines and term dates for ${year ? (papers ? 'your papers' : cohortLabel(year)) : 'all three years'}${my.signedIn ? ', with your own events' : ''}. Hide what you don’t need, and add any of it to your own calendar app.`;
  const addMine = () => {
    if (requireAuth('Sign in to add your own events', () => setEditingMine({ event: null }))) setEditingMine({ event: null });
  };
  const actions = (
    <>
      {my.signedIn ? (
        <Button leadingIcon={SlidersHorizontal} onClick={() => setCustomising(true)} data-hub="calendar-customise-open">
          Customise
        </Button>
      ) : null}
      <Button leadingIcon={RssSimple} onClick={() => setSubscribing(true)} data-hub="calendar-subscribe-open">
        Subscribe
      </Button>
      {manages ? (
        <Button leadingIcon={Plus} onClick={() => setEditing({ event: null })} data-hub="calendar-add">
          Programme date
        </Button>
      ) : null}
      <Button variant="primary" leadingIcon={CalendarPlus} onClick={addMine} data-hub="calendar-mine-add">
        New event
      </Button>
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
        <CalendarBody
          events={events}
          calendarEmpty={!query.data.length && !my.events.length}
          my={my}
          onEdit={manages ? (e) => setEditing({ event: e }) : undefined}
          onAdd={manages ? () => setEditing({ event: null }) : undefined}
          onEditMine={(e) => (e.mine ? setEditingMine({ event: e.mine }) : undefined)}
        />
      )}
      <SubscribeDialog open={subscribing} year={year} papers={papers} my={my} onClose={() => setSubscribing(false)} />
      {my.signedIn ? (
        <CustomiseDialog
          open={customising}
          onClose={() => setCustomising(false)}
          my={my}
          programme={query.data ?? []}
          onPapers={() => {
            setCustomising(false);
            setPickingPapers(true);
          }}
        />
      ) : null}
      <PapersDialog open={pickingPapers} onClose={() => setPickingPapers(false)} />
      <EventEditor editing={editing} employers={employers} onClose={() => setEditing(null)} />
      <MyEventEditor editing={editingMine} onClose={() => setEditingMine(null)} />
    </Page>
  );
}

/** The add/edit dialog for the student's own events, then the page moves to what was saved. */
function MyEventEditor({ editing, onClose }: { editing: { event: PersonalEvent | null } | null; onClose: () => void }) {
  const { push } = useToast();
  const [, setEventId] = useQueryParam('event');
  const [, setMonthParam] = useQueryParam('month');
  const [day] = useState(() => todayKey());
  return (
    <MyEventDialog
      open={!!editing}
      event={editing?.event ?? null}
      defaultDate={day}
      onClose={onClose}
      onSaved={(saved, created) => {
        onClose();
        setMonthParam(saved.date.slice(0, 7), { replace: true });
        setEventId(occurrenceId(saved, saved.date), { replace: true });
        push({ tone: 'success', title: created ? 'Added to your calendar' : 'Changes saved', body: `${saved.title}, ${formatLong(parseDay(saved.date))}. Only you see it.` });
      }}
    />
  );
}

/** What the toast adds about the students an edit told. */
function toldLine(told: DateNotice | undefined): string {
  if (told?.notice === 'sent') return told.told === 1 ? ' 1 person was told.' : ` ${told.told} people were told.`;
  if (told?.notice === 'limit') return ' They were told about this event today already, so not again.';
  return '';
}

/** The add/edit dialog, then the page moves to what was saved. */
function EventEditor({ editing, employers, onClose }: { editing: { event: CalendarEvent | null } | null; employers: readonly { id: string; name: string }[]; onClose: () => void }) {
  const { push } = useToast();
  const [, setEventId] = useQueryParam('event');
  const [, setMonthParam] = useQueryParam('month');
  return (
    <EventFormDialog
      open={!!editing}
      event={editing?.event ?? null}
      employers={employers}
      onClose={onClose}
      onSaved={(saved, created, told) => {
        onClose();
        setMonthParam(monthKey(monthOfEvent(saved)), { replace: true });
        setEventId(saved.id, { replace: true });
        push({ tone: 'success', title: created ? 'Event added' : 'Changes saved', body: `${saved.title}, ${formatLong(parseDay(saved.date))}.${toldLine(told)}` });
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
  /** programme dates on the student's calendar, and their own events' occurrences */
  events: CalendarEvent[];
  /** nothing at all on the calendar */
  calendarEmpty: boolean;
  my: MyCalendar;
  /** moderators only */
  onEdit?: (e: CalendarEvent) => void;
  onAdd?: () => void;
  onEditMine: (e: CalendarEvent) => void;
}

function CalendarBody({ events, calendarEmpty, my, onEdit, onAdd, onEditMine }: CalendarBodyProps) {
  const { push } = useToast();
  const remove = useDeleteEvent();
  const removeMine = useDeleteMyEvent();
  // Today in Bahrain, read once per visit: relative dates stay the same while the page is open.
  const [today] = useState(() => bahrainToday());
  const view = useCalendarView(events, today, my.signedIn);
  const { eventId, open, close } = view;
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const [deletingMine, setDeletingMine] = useState<CalendarEvent | null>(null);
  const { setHidden } = my;

  const hide = (e: CalendarEvent, kind: HiddenKind, value: string) => {
    setHidden(kind, value, true);
    close();
    const what = kind === 'hiddenEvents' ? e.title : kind === 'hiddenTypes' ? `Every ${typeLabel(value).toLowerCase()}` : `Every ${e.unitCode ?? 'module'} date`;
    push({ tone: 'success', title: 'Hidden from your calendar', body: `${what} is off your calendar. Customise shows it again.`, action: { label: 'Undo', onClick: () => setHidden(kind, value, false) } });
  };

  const confirmDeleteMine = () => {
    const gone = deletingMine?.mine;
    if (!gone) return;
    removeMine.mutate(gone.id, {
      onSuccess: () => {
        setDeletingMine(null);
        close();
        push({ tone: 'success', title: 'Event deleted', body: `${gone.title} is off your calendar.` });
      },
    });
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

  return (
    <>
      <PageSection>
        <ForYou year={view.year} nextExam={view.nextExam} week={view.week} today={today} todayKey={view.todayKey} selectedId={eventId} onOpen={open} />
      </PageSection>

      <PageSection>
        <Browse view={view} today={today} calendarEmpty={calendarEmpty} onAdd={onAdd} />
      </PageSection>

      <EventDrawer
        event={view.openEvent}
        papers={view.papers}
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
        onEditMine={onEditMine}
        onDeleteMine={(e) => {
          removeMine.reset();
          setDeletingMine(e);
        }}
        onHide={my.signedIn && my.prefs ? hide : undefined}
      />
      <ConfirmDialog
        open={!!deletingMine}
        title="Delete this event?"
        body={
          deletingMine?.mine ? (
            <p>
              <b>{deletingMine.title}</b>
              {deletingMine.mine.repeat === 'none' ? `, ${formatLong(parseDay(deletingMine.date))},` : ', every repeat of it,'} comes off your calendar and your private link. This can’t be undone.
            </p>
          ) : null
        }
        confirmLabel="Delete event"
        tone="danger"
        busy={removeMine.isPending}
        error={removeMine.isError ? errorMessage(removeMine.error, 'The event wasn’t deleted. Try again.') : null}
        onConfirm={confirmDeleteMine}
        onClose={() => setDeletingMine(null)}
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
