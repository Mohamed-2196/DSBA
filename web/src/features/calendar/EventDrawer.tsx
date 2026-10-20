import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { AddToBoard } from '../board/public';
import { BREAKPOINTS, useMediaQuery, useToast, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import {
  Badge,
  Button,
  CohortBadge,
  cx,
  Drawer,
  IconButton,
  ModuleArt,
  ModuleIcon,
  moduleArtSrc,
  Icon,
  glyph,
} from '../../ui';
import {
  dayKey,
  daysUntil,
  formatLong,
  formatMonthYear,
  formatShort,
  formatShortYear,
  parseDay,
  weekdayOf,
} from '../../lib/dates';
import { useCopyLink } from '../../lib/useCopyLink';
import { AddExamsToCalendar, AddToCalendar } from './AddToCalendar';
import { eventPageUrl, myEventIcsUrl } from './api';
import { countdownLabel } from './dates';
import {
  dotClass,
  sourceLine,
  splitTitle,
  TYPE_BADGE_TONE,
  typeLabel,
  typePlural,
  whenAndWhere,
  windowLeft,
} from './eventMeta';
import { monthDayOf, monthlyRule, reminderLabel, repeatLabel } from './mine';
import type { CalendarEvent, EventType } from './types';
import type { HiddenKind } from './useMyCalendar';

export interface EventDrawerProps {
  event: CalendarEvent | null;
  /** the student's papers in `year` (null: all its modules) */
  papers?: ReadonlySet<string> | null;
  /** Every event on the calendar (for "also on this day" and the module's other dates). */
  events: CalendarEvent[];
  today: Date;
  year: CohortYear | null;
  /** Exams ahead for `year`: the drawer then offers all of them as one file. */
  hasExams: boolean;
  onClose: () => void;
  onOpen: (e: CalendarEvent) => void;
  /** Moderators: edit and delete programme dates. */
  onEdit?: (e: CalendarEvent) => void;
  onDelete?: (e: CalendarEvent) => void;
  /** Signed in: edit and delete their own events, and hide programme dates from their calendar. */
  onEditMine?: (e: CalendarEvent) => void;
  onDeleteMine?: (e: CalendarEvent) => void;
  onHide?: (e: CalendarEvent, kind: HiddenKind, value: string) => void;
}

/**
 * Event details: date, type, cohort, time and place when published, linked module, countdown, and "Add to
 * calendar" (the API's .ics files). Opened from the list, the grid, the top of the page or a ?event=<id> link.
 * Moderators also get Edit and Delete.
 */
export function EventDrawer({
  event,
  papers,
  events,
  today,
  year,
  hasExams,
  onClose,
  onOpen,
  onEdit,
  onDelete,
  onEditMine,
  onDeleteMine,
  onHide,
}: EventDrawerProps) {
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const copy = useCopyLink();
  const { push } = useToast();
  const copyLink = (e: CalendarEvent) =>
    copy(eventPageUrl(e), 'Anyone with the link sees this date on the DSBA Hub calendar.');
  const onDownload = () =>
    push({ tone: 'info', title: 'Downloading an .ics file', body: 'Open it to add the event to your calendar.' });
  return (
    <Drawer
      open={!!event}
      onClose={onClose}
      side={isMobile ? 'bottom' : 'right'}
      width={480}
      title={event ? event.title : ''}
      className="cal-drawer"
      bodyClassName="cal-drawer__body"
      footer={
        event?.mine ? (
          <div className="cal-drawer__footer">
            {onEditMine ? (
              <Button
                leadingIcon={<Icon glyph={glyph.edit} />}
                onClick={() => onEditMine(event)}
                data-hub="calendar-mine-edit"
              >
                Edit
              </Button>
            ) : null}
            {onDeleteMine ? (
              <IconButton
                label="Delete this event"
                icon={<Icon glyph={glyph.trash} />}
                variant="secondary"
                tooltip
                tooltipSide="top"
                onClick={() => onDeleteMine(event)}
                data-hub="calendar-mine-delete"
              />
            ) : null}
            <span className="cal-drawer__spacer" />
            <Button
              variant="primary"
              leadingIcon={<Icon glyph={glyph.calendarAdd} />}
              href={myEventIcsUrl(event.mine.id)}
              download
              external={false}
              onClick={onDownload}
            >
              Add to calendar
            </Button>
          </div>
        ) : event ? (
          <div className="cal-drawer__footer">
            <IconButton
              label="Copy link to this date"
              icon={<Icon glyph={glyph.link} />}
              variant="secondary"
              tooltip
              tooltipSide="top"
              onClick={() => void copyLink(event)}
            />
            {onEdit ? (
              <IconButton
                label="Edit this date"
                icon={<Icon glyph={glyph.edit} />}
                variant="secondary"
                tooltip
                tooltipSide="top"
                onClick={() => onEdit(event)}
                data-hub="calendar-edit"
              />
            ) : null}
            {onDelete ? (
              <IconButton
                label="Delete this date"
                icon={<Icon glyph={glyph.trash} />}
                variant="secondary"
                tooltip
                tooltipSide="top"
                onClick={() => onDelete(event)}
                data-hub="calendar-delete"
              />
            ) : null}
            <span className="cal-drawer__spacer" />
            <AddToCalendar event={event} />
          </div>
        ) : null
      }
    >
      {event?.mine ? (
        <MineContent event={event} events={events} today={today} onOpen={onOpen} />
      ) : event ? (
        <DrawerContent
          event={event}
          events={events}
          today={today}
          onOpen={onOpen}
          examsYear={hasExams ? year : undefined}
          papers={papers}
          onHide={onHide}
        />
      ) : null}
    </Drawer>
  );
}

interface DrawerContentProps {
  event: CalendarEvent;
  events: CalendarEvent[];
  today: Date;
  onOpen: (e: CalendarEvent) => void;
  /** offer every exam of this cohort (null: of every cohort) as one file; undefined: no exams ahead */
  examsYear?: CohortYear | null;
  /** the student's papers, for "All your exams" */
  papers?: ReadonlySet<string> | null;
  onHide?: (e: CalendarEvent, kind: HiddenKind, value: string) => void;
}

// The dates a student works towards: these can go on a board.
const BOARD_TYPES: ReadonlySet<EventType> = new Set(['exam', 'mock', 'deadline']);

function DrawerContent({ event, events, today, onOpen, examsYear, papers, onHide }: DrawerContentProps) {
  const { getModule } = useModules();
  const { featureOn } = useAuth();
  const date = parseDay(event.date);
  const end = event.endDate && event.endDate > event.date ? parseDay(event.endDate) : null;
  const days = daysUntil(date, today);
  const module = getModule(event.moduleId);
  const { code } = splitTitle(event);
  const sameDay = events.filter((e) => e.date === event.date && e.id !== event.id);
  const related = module ? events.filter((e) => e.moduleId === module.id) : [];
  const where = whenAndWhere(event);
  const left = windowLeft(event, dayKey(today));
  const source = sourceLine(event);

  return (
    <div className="cal-drawer__content">
      <div className="cal-drawer__badges">
        <Badge tone={TYPE_BADGE_TONE[event.type]} className={event.type === 'event' ? 'cal-badge--event' : undefined}>
          {typeLabel(event.type)}
        </Badge>
        <CohortBadge year={event.year} />
      </div>

      <div className="cal-drawer__when">
        <span className="cal-drawer__day" aria-hidden="true">
          {date.getDate()}
        </span>
        <span className="cal-drawer__datebits">
          <span className="cal-drawer__weekday">{weekdayOf(date).long}</span>
          <span className="cal-drawer__monthyear">{formatMonthYear(date)}</span>
        </span>
        <span
          className={cx(
            'cal-drawer__countdown',
            days < 0 && !left && 'is-past',
            event.type === 'exam' && days >= 0 && days <= 7 && 'is-soon',
          )}
        >
          {left ?? countdownLabel(days)}
        </span>
        <span className="visually-hidden">{formatLong(date)}</span>
      </div>

      {end ? <p className="cal-drawer__where">Until {formatLong(end)}</p> : null}

      {where ? (
        <p className={cx('cal-drawer__where', event.type === 'exam' && !event.time && 'is-unset')}>
          <span className="visually-hidden">Time and place: </span>
          {where}
        </p>
      ) : null}

      {event.duration || event.rules ? (
        <dl className="cal-drawer__facts">
          {event.duration ? (
            <div>
              <dt>Length</dt>
              <dd>{event.duration}</dd>
            </div>
          ) : null}
          {event.rules ? (
            <div>
              <dt>Rules</dt>
              <dd>{event.rules}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {event.type === 'exam' && !event.rules && featureOn('forum') ? (
        <p className="cal-drawer__note">
          What to bring and which calculators: ask in the forum’s <Link to="/forum?tag=exams">Exam rules</Link> threads.
        </p>
      ) : null}
      {source ? <p className="cal-drawer__note">{source}</p> : null}

      {featureOn('board') && BOARD_TYPES.has(event.type) ? (
        <AddToBoard link={{ type: 'event', id: event.id }} className="cal-drawer__board" />
      ) : null}

      {module ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-module">
          <h3 id="cal-drawer-module" className="cal-drawer__h">
            Module
          </h3>
          <div className="cal-drawer__module">
            {moduleArtSrc(module.art) ? (
              <ModuleArt art={module.art} className="cal-drawer__module-art" />
            ) : (
              <span className="cal-drawer__module-icon" aria-hidden="true">
                <ModuleIcon moduleId={module.id} />
              </span>
            )}
            <span className="cal-drawer__module-text">
              {module.unitCode || code ? (
                <span className="u-code cal-drawer__module-code">{module.unitCode || code}</span>
              ) : null}
              <span className="cal-drawer__module-name">{module.name}</span>
            </span>
            <Button size="sm" to={`/modules/${module.id}`}>
              Open module
            </Button>
          </div>
        </section>
      ) : null}

      {sameDay.length ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-same">
          <h3 id="cal-drawer-same" className="cal-drawer__h">
            Also on this day
          </h3>
          <ul role="list" className="cal-drawer__list">
            {sameDay.map((e) => (
              <li key={e.id}>
                <button type="button" className="cal-drawer__row" onClick={() => onOpen(e)}>
                  <span className={cx('cal-dot', dotClass(e))} aria-hidden="true" />
                  <span className="cal-drawer__row-title">{e.title}</span>
                  {e.mine ? null : <CohortBadge year={e.year} variant="dot" size="sm" short />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {module && related.length > 1 ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-related">
          <h3 id="cal-drawer-related" className="cal-drawer__h">
            Every date for {module.unitCode || module.shortName}
          </h3>
          <ol role="list" className="cal-drawer__list cal-drawer__timeline">
            {related.map((e) => {
              const d = parseDay(e.date);
              const current = e.id === event.id;
              return (
                <li key={e.id} className={cx(current && 'is-current', d < today && 'is-past')}>
                  <button
                    type="button"
                    className="cal-drawer__row"
                    onClick={() => onOpen(e)}
                    aria-current={current ? 'true' : undefined}
                    disabled={current}
                  >
                    <span className="cal-drawer__row-date u-tabular">
                      {d.getFullYear() === today.getFullYear() ? formatShort(d) : formatShortYear(d)}
                    </span>
                    <span className={cx('cal-dot', dotClass(e))} aria-hidden="true" />
                    <span className="cal-drawer__row-title">{splitTitle(e).rest}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {event.sample ? (
        <p className="cal-drawer__sample">
          <b>Not confirmed yet.</b> Ask your student rep or the programme office before you plan around it.
        </p>
      ) : null}

      <p className="cal-drawer__note">
        {event.time || event.place
          ? 'Added as an all-day event, with the time and place in its notes.'
          : 'Added as an all-day event.'}
        {event.type === 'exam' || event.type === 'deadline'
          ? ' The .ics file includes a reminder at 9:00 the day before.'
          : ''}
      </p>
      {examsYear !== undefined ? (
        <div className="cal-drawer__exams">
          <AddExamsToCalendar year={examsYear} papers={examsYear ? papers : null} size="sm" />
        </div>
      ) : null}

      {onHide ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-hide">
          <h3 id="cal-drawer-hide" className="cal-drawer__h">
            Don’t need it?
          </h3>
          <p className="cal-drawer__note">
            Hidden dates leave your list, month, Home and private link. Show them again from Customise.
          </p>
          <div className="cal-drawer__hide">
            <Button
              size="sm"
              leadingIcon={<Icon glyph={glyph.eyeOff} />}
              onClick={() => onHide(event, 'hiddenEvents', event.id)}
              data-hub="calendar-hide"
            >
              Hide this date
            </Button>
            {module ? (
              <Button size="sm" variant="ghost" onClick={() => onHide(event, 'hiddenModules', module.id)}>
                Hide all {module.unitCode || module.shortName} dates
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => onHide(event, 'hiddenTypes', event.type)}>
              Hide all {typePlural(event.type)}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** The days ahead taken off a repeat: 'Sun 1 Nov, Sun 8 Nov', 'Sun 1 Nov, Sun 8 Nov, Sun 15 Nov and 2 more'. */
function skippedLine(skipped: readonly string[], today: string): string | null {
  const ahead = skipped.filter((d) => d >= today);
  if (!ahead.length) return null;
  const shown = ahead.slice(0, 3).map((d) => formatShort(parseDay(d)));
  return ahead.length > 3 ? `${shown.join(', ')} and ${ahead.length - 3} more` : shown.join(', ');
}

/** One of the student's own events: when, where, its repeat (and the days taken off it), reminder and notes. */
function MineContent({
  event,
  events,
  today,
  onOpen,
}: {
  event: CalendarEvent;
  events: CalendarEvent[];
  today: Date;
  onOpen: (e: CalendarEvent) => void;
}) {
  const { featureOn } = useAuth();
  const mine = event.mine;
  if (!mine) return null;
  const date = parseDay(event.date);
  const end = event.endDate && event.endDate > event.date ? parseDay(event.endDate) : null;
  const days = daysUntil(date, today);
  const left = windowLeft(event, dayKey(today));
  const sameDay = events.filter((e) => e.date === event.date && e.id !== event.id);
  const repeat = repeatLabel(mine);
  const reminder = reminderLabel(mine.remind, !mine.startTime);
  const where = [event.time ?? 'All day', event.place].filter(Boolean).join(', ');
  const notOn = skippedLine(mine.skipped, dayKey(today));
  return (
    <div className={cx('cal-drawer__content', `cal-colour--${mine.colour}`)}>
      <div className="cal-drawer__badges">
        <span className="cal-mine-badge">
          <span className={cx('cal-dot', dotClass(event))} aria-hidden="true" />
          Your event
        </span>
      </div>

      <div className="cal-drawer__when">
        <span className="cal-drawer__day" aria-hidden="true">
          {date.getDate()}
        </span>
        <span className="cal-drawer__datebits">
          <span className="cal-drawer__weekday">{weekdayOf(date).long}</span>
          <span className="cal-drawer__monthyear">{formatMonthYear(date)}</span>
        </span>
        <span className={cx('cal-drawer__countdown', days < 0 && !left && 'is-past')}>
          {left ?? countdownLabel(days)}
        </span>
        <span className="visually-hidden">{formatLong(date)}</span>
      </div>

      {end ? <p className="cal-drawer__where">Until {formatLong(end)}</p> : null}
      <p className="cal-drawer__where">
        <span className="visually-hidden">Time and place: </span>
        {where}
      </p>

      {repeat || reminder ? (
        <dl className="cal-drawer__facts">
          {repeat ? (
            <div>
              <dt>Repeats</dt>
              <dd>
                {repeat}
                {mine.repeat === 'monthly' ? (
                  <span className="cal-drawer__rule">{monthlyRule(monthDayOf(mine))}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {notOn ? (
            <div>
              <dt>Not on</dt>
              <dd>{notOn}</dd>
            </div>
          ) : null}
          {reminder ? (
            <div>
              <dt>Reminder</dt>
              <dd>{reminder}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {mine.notes ? <p className="cal-drawer__notes">{mine.notes}</p> : null}

      {featureOn('board') ? (
        <AddToBoard link={{ type: 'my_event', id: mine.id }} className="cal-drawer__board" />
      ) : null}

      {sameDay.length ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-same">
          <h3 id="cal-drawer-same" className="cal-drawer__h">
            Also on this day
          </h3>
          <ul role="list" className="cal-drawer__list">
            {sameDay.map((e) => (
              <li key={e.id}>
                <button type="button" className="cal-drawer__row" onClick={() => onOpen(e)}>
                  <span className={cx('cal-dot', dotClass(e))} aria-hidden="true" />
                  <span className="cal-drawer__row-title">{e.title}</span>
                  {e.mine ? null : <CohortBadge year={e.year} variant="dot" size="sm" short />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="cal-drawer__note">
        Only you see this event.
        {reminder
          ? ' Its reminder comes as a notification here, and from your calendar app if you subscribe to your private link.'
          : ''}
      </p>
    </div>
  );
}
