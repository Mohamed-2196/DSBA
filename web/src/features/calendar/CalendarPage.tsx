import { useMemo, useState } from 'react';
import { RssSimple } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { BREAKPOINTS, cohortLabel, useMediaQuery, useSetQueryParams, useToast, useYear } from '../../state';
import { Button, ConfirmDialog, Icon, Page, PageHeader, PageSection, QueryError, Skeleton, glyph } from '../../ui';
import { formatLong, formatLongDay, parseDay, todayKey, today as bahrainToday, type DayKey } from '../../lib/dates';
import { useCalendarEvents, useDeleteEvent, useDeleteMyEvent, useDeleteMyOccurrence } from './api';
import { Browse, CalendarBar } from './Browse';
import { CustomiseDialog } from './CustomiseDialog';
import { monthKey } from './dates';
import { EventDrawer } from './EventDrawer';
import { EventFormDialog, type DateNotice } from './EventFormDialog';
import { typePlural } from './eventMeta';
import { ForYou } from './ForYou';
import { myCalendar, occurrenceId, repeats } from './mine';
import { MyEventDialog } from './MyEventDialog';
import { ScopeChoice } from './ScopeChoice';
import { useEmployers } from '../career/public';
import { PapersDialog, usePapers } from '../papers/public';
import { SubscribeDialog } from './SubscribeDialog';
import type { CalendarEvent, ChangeScope, PersonalEvent } from './types';
import { monthOfEvent, useCalendarView } from './useCalendarView';
import { useMyCalendar, type HiddenKind, type MyCalendar } from './useMyCalendar';
import './calendar-shared.css';
import './CalendarPage.css';

/** The student's own event being added or edited: `day` is the day it opened on; a new `session` mounts a fresh form. */
interface MineEditing {
  open: boolean;
  event: PersonalEvent | null;
  day: DayKey;
  session: number;
}

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
  const [editingMine, setEditingMine] = useState<MineEditing>(() => ({
    open: false,
    event: null,
    day: todayKey(),
    session: 0,
  }));
  const events = useMemo(
    () => (query.data ? myCalendar(query.data, my.events, my.prefs) : []),
    [query.data, my.events, my.prefs],
  );

  const whose = year ? (papers ? 'your papers' : cohortLabel(year)) : 'all three years';
  const description = my.signedIn
    ? `Exams, deadlines and term dates for ${whose}, with your own events. Hide what you don’t need, and add any of it to your own calendar app.`
    : `Exams, deadlines and term dates for ${whose}. Add any of it to your own calendar app, or sign in to add events of your own.`;

  /** A new event of the student's own on `day` (today without one); a guest signs in first. */
  const addMine = (day: DayKey = todayKey()) => {
    const go = () => setEditingMine((m) => ({ open: true, event: null, day, session: m.session + 1 }));
    if (requireAuth('Sign in to add your own events', go)) go();
  };
  /** Edit the student's own event from one of its days. */
  const editMine = (e: CalendarEvent) => {
    const own = e.mine;
    if (own) setEditingMine((m) => ({ open: true, event: own, day: e.date, session: m.session + 1 }));
  };
  const actions = (
    <>
      {my.signedIn ? (
        <Button
          leadingIcon={<Icon glyph={glyph.settings} />}
          onClick={() => setCustomising(true)}
          data-hub="calendar-customise-open"
        >
          Customise
        </Button>
      ) : null}
      <Button leadingIcon={RssSimple} onClick={() => setSubscribing(true)} data-hub="calendar-subscribe-open">
        Subscribe
      </Button>
      {manages ? (
        <Button
          leadingIcon={<Icon glyph={glyph.plus} />}
          onClick={() => setEditing({ event: null })}
          data-hub="calendar-add"
        >
          Programme date
        </Button>
      ) : null}
      <Button
        variant="primary"
        leadingIcon={<Icon glyph={glyph.plus} />}
        onClick={() => addMine()}
        data-hub="calendar-mine-add"
      >
        New event
      </Button>
    </>
  );

  return (
    <Page className="cal-page">
      <PageHeader section="calendar" title="Calendar" description={description} actions={actions} />
      {query.isPending ? (
        <CalendarSkeleton />
      ) : query.isError ? (
        <QueryError
          error={query.error}
          title="The calendar didn’t load"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <CalendarBody
          events={events}
          calendarEmpty={!query.data.length && !my.events.length}
          my={my}
          onEdit={manages ? (e) => setEditing({ event: e }) : undefined}
          onAddDate={manages ? () => setEditing({ event: null }) : undefined}
          onAddMine={addMine}
          onEditMine={editMine}
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
      <MyEventEditor editing={editingMine} onClose={() => setEditingMine((m) => ({ ...m, open: false }))} />
    </Page>
  );
}

/** The add/edit dialog for the student's own events, then the page moves to the day saved. */
function MyEventEditor({ editing, onClose }: { editing: MineEditing; onClose: () => void }) {
  const { push } = useToast();
  const setParams = useSetQueryParams();
  return (
    <MyEventDialog
      key={editing.session}
      open={editing.open}
      event={editing.event}
      day={editing.day}
      onClose={onClose}
      onSaved={(saved, created, day) => {
        onClose();
        setParams({ month: day.slice(0, 7), event: occurrenceId(saved, day) }, { replace: true });
        push({
          tone: 'success',
          ...(created ? { mate: 'blink' as const } : {}),
          title: created ? 'Added to your calendar' : 'Changes saved',
          body: `${saved.title}, ${formatLong(parseDay(day))}. Only you see it.`,
        });
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
function EventEditor({
  editing,
  employers,
  onClose,
}: {
  editing: { event: CalendarEvent | null } | null;
  employers: readonly { id: string; name: string }[];
  onClose: () => void;
}) {
  const { push } = useToast();
  const setParams = useSetQueryParams();
  return (
    <EventFormDialog
      open={!!editing}
      event={editing?.event ?? null}
      employers={employers}
      onClose={onClose}
      onSaved={(saved, created, told) => {
        onClose();
        setParams({ month: monthKey(monthOfEvent(saved)), event: saved.id }, { replace: true });
        push({
          tone: 'success',
          title: created ? 'Date added' : 'Changes saved',
          body: `${saved.title}, ${formatLong(parseDay(saved.date))}.${toldLine(told)}`,
        });
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

/** The confirm button of a deletion: what goes, said plainly. */
const DELETE_LABEL: Record<ChangeScope, string> = {
  one: 'Delete this event',
  following: 'Delete these events',
  all: 'Delete all events',
};

/** The toast after a deletion of the student's own: what went. */
function deletedLine(title: string, day: DayKey, scope: ChangeScope, repeating: boolean): string {
  if (!repeating || scope === 'all') return `${title} is off your calendar.`;
  const when = formatLongDay(parseDay(day));
  return scope === 'one'
    ? `${title} on ${when} is off your calendar.`
    : `${title}, from ${when} on, is off your calendar.`;
}

interface CalendarBodyProps {
  /** programme dates on the student's calendar, and their own events' occurrences */
  events: CalendarEvent[];
  /** nothing at all on the calendar */
  calendarEmpty: boolean;
  my: MyCalendar;
  /** moderators only */
  onEdit?: (e: CalendarEvent) => void;
  onAddDate?: () => void;
  /** a new event of the student's own (on a day) */
  onAddMine: (day?: DayKey) => void;
  onEditMine: (e: CalendarEvent) => void;
}

function CalendarBody({ events, calendarEmpty, my, onEdit, onAddDate, onAddMine, onEditMine }: CalendarBodyProps) {
  const { push } = useToast();
  const remove = useDeleteEvent();
  const removeMine = useDeleteMyEvent();
  const removeDay = useDeleteMyOccurrence();
  // Today in Bahrain, read once per visit: relative dates stay the same while the page is open.
  const [today] = useState(() => bahrainToday());
  const wide = useMediaQuery(BREAKPOINTS.desktop);
  const view = useCalendarView(events, today, my.signedIn, wide ? 'month' : 'list');
  const { eventId, open, close } = view;
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const [deletingMine, setDeletingMine] = useState<{ event: CalendarEvent; scope: ChangeScope } | null>(null);
  const { setHidden } = my;

  const hide = (e: CalendarEvent, kind: HiddenKind, value: string) => {
    setHidden(kind, value, true);
    close();
    const body =
      kind === 'hiddenEvents'
        ? `${e.title} is off your calendar.`
        : kind === 'hiddenTypes'
          ? `All ${typePlural(value)} are off your calendar.`
          : `All ${e.unitCode ?? 'module'} dates are off your calendar.`;
    const again = kind === 'hiddenEvents' ? 'Customise shows it again.' : 'Customise shows them again.';
    push({
      tone: 'success',
      title: 'Hidden from your calendar',
      body: `${body} ${again}`,
      action: { label: 'Undo', onClick: () => setHidden(kind, value, false) },
    });
  };

  const own = deletingMine?.event.mine ?? null;
  const ownRepeats = !!own && repeats(own);
  const deletingBusy = removeMine.isPending || removeDay.isPending;
  const deletingError = removeMine.error ?? removeDay.error;
  const confirmDeleteMine = () => {
    if (!deletingMine || !own) return;
    const { event: occurrence, scope } = deletingMine;
    const done = () => {
      setDeletingMine(null);
      close();
      push({
        tone: 'success',
        title: 'Event deleted',
        body: deletedLine(own.title, occurrence.date, scope, ownRepeats),
      });
    };
    if (scope === 'all' || !ownRepeats) removeMine.mutate(own.id, { onSuccess: done });
    else removeDay.mutate({ id: own.id, day: occurrence.date, scope }, { onSuccess: done });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const gone = deleting;
    remove.mutate(gone.id, {
      onSuccess: () => {
        setDeleting(null);
        if (eventId === gone.id) close();
        push({ tone: 'success', title: 'Date deleted', body: `${gone.title} is off the calendar.` });
      },
    });
  };

  return (
    <>
      {my.loadError ? (
        <QueryError
          error={my.loadError}
          title="Your own events didn’t load"
          size="sm"
          onRetry={my.retry}
          retrying={my.retrying}
          className="cal-mine-error"
        />
      ) : null}
      <CalendarBar view={view} />
      {view.mode === 'list' ? (
        <PageSection>
          <ForYou
            year={view.year}
            nextExam={view.nextExam}
            week={view.week}
            today={today}
            todayKey={view.todayKey}
            selectedId={eventId}
            onOpen={open}
          />
        </PageSection>
      ) : null}

      <PageSection>
        <Browse view={view} today={today} calendarEmpty={calendarEmpty} onAddDate={onAddDate} onAddMine={onAddMine} />
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
          removeDay.reset();
          setDeletingMine({ event: e, scope: e.mine && repeats(e.mine) ? 'one' : 'all' });
        }}
        onHide={my.signedIn && my.prefs ? hide : undefined}
      />
      <ConfirmDialog
        open={!!deletingMine}
        title={ownRepeats ? 'Delete a repeating event?' : 'Delete this event?'}
        body={
          deletingMine && own ? (
            ownRepeats ? (
              <p>
                <b>{own.title}</b> repeats. Choose what to delete. It comes off your calendar and your private link, and
                can’t be undone.
              </p>
            ) : (
              <p>
                <b>{own.title}</b>, {formatLong(parseDay(deletingMine.event.date))}, comes off your calendar and your
                private link. This can’t be undone.
              </p>
            )
          ) : null
        }
        confirmLabel={ownRepeats && deletingMine ? DELETE_LABEL[deletingMine.scope] : 'Delete event'}
        tone="danger"
        busy={deletingBusy}
        error={deletingError ? errorMessage(deletingError, 'The event wasn’t deleted. Try again.') : null}
        onConfirm={confirmDeleteMine}
        onClose={() => setDeletingMine(null)}
      >
        {deletingMine && own && ownRepeats ? (
          <ScopeChoice
            legend="Delete"
            value={deletingMine.scope}
            onChange={(scope) => setDeletingMine({ ...deletingMine, scope })}
            event={own}
            day={deletingMine.event.date}
            disabled={deletingBusy}
          />
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!deleting}
        title="Delete this date?"
        body={
          deleting ? (
            <p>
              <b>{deleting.title}</b>, {formatLong(parseDay(deleting.date))}, comes off everyone’s calendar and the
              calendar feed. This can’t be undone.
            </p>
          ) : null
        }
        confirmLabel="Delete date"
        tone="danger"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, 'The date wasn’t deleted. Try again.') : null}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
