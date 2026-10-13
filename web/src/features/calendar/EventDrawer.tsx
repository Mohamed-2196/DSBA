import { LinkSimple, PencilSimple, Trash } from '@phosphor-icons/react';
import { BREAKPOINTS, useMediaQuery, useToast, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Badge, Button, CohortBadge, cx, Drawer, IconButton, ModuleIcon } from '../../ui';
import { daysUntil, formatLong, formatMonthYear, formatShort, formatShortYear, parseDay, weekdayOf } from '../../lib/dates';
import { copyText } from '../../lib/share';
import { AddExamsToCalendar, AddToCalendar } from './AddToCalendar';
import { eventPageUrl } from './api';
import { countdownLabel } from './dates';
import { splitTitle, TYPE_BADGE_TONE, typeLabel, whenAndWhere } from './eventMeta';
import type { CalendarEvent } from './types';

export interface EventDrawerProps {
  event: CalendarEvent | null;
  /** Every event on the calendar (for "also on this day" and the module's other dates). */
  events: CalendarEvent[];
  today: Date;
  year: CohortYear | null;
  /** Exams ahead for `year`: the drawer then offers all of them as one file. */
  hasExams: boolean;
  onClose: () => void;
  onOpen: (e: CalendarEvent) => void;
  /** Moderators: edit and delete. */
  onEdit?: (e: CalendarEvent) => void;
  onDelete?: (e: CalendarEvent) => void;
}

/**
 * Event details: date, type, cohort, time and place when published, linked module, countdown, and "Add to
 * calendar" (the API's .ics files). Opened from the list, the grid, the top of the page or a ?event=<id> link.
 * Moderators also get Edit and Delete.
 */
export function EventDrawer({ event, events, today, year, hasExams, onClose, onOpen, onEdit, onDelete }: EventDrawerProps) {
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const { push } = useToast();
  const copyLink = async (e: CalendarEvent) => {
    const url = eventPageUrl(e);
    push(
      (await copyText(url))
        ? { tone: 'success', title: 'Link copied', body: 'Anyone with the link sees this date on the DSBA Hub calendar.' }
        : { tone: 'alert', title: 'Couldn’t copy the link', body: url },
    );
  };
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
        event ? (
          <div className="cal-drawer__footer">
            <IconButton label="Copy link to this event" icon={LinkSimple} variant="secondary" tooltip tooltipSide="top" onClick={() => void copyLink(event)} />
            {onEdit ? <IconButton label="Edit this event" icon={PencilSimple} variant="secondary" tooltip tooltipSide="top" onClick={() => onEdit(event)} data-hub="calendar-edit" /> : null}
            {onDelete ? <IconButton label="Delete this event" icon={Trash} variant="secondary" tooltip tooltipSide="top" onClick={() => onDelete(event)} data-hub="calendar-delete" /> : null}
            <span className="cal-drawer__spacer" />
            <AddToCalendar event={event} />
          </div>
        ) : null
      }
    >
      {event ? <DrawerContent event={event} events={events} today={today} onOpen={onOpen} examsYear={hasExams ? year : undefined} /> : null}
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
}

function DrawerContent({ event, events, today, onOpen, examsYear }: DrawerContentProps) {
  const { getModule } = useModules();
  const date = parseDay(event.date);
  const end = event.endDate && event.endDate > event.date ? parseDay(event.endDate) : null;
  const days = daysUntil(date, today);
  const module = getModule(event.moduleId);
  const { code } = splitTitle(event);
  const sameDay = events.filter((e) => e.date === event.date && e.id !== event.id);
  const related = module ? events.filter((e) => e.moduleId === module.id) : [];
  const where = whenAndWhere(event);

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
        <span className={cx('cal-drawer__countdown', days < 0 && 'is-past', event.type === 'exam' && days >= 0 && days <= 7 && 'is-soon')}>{countdownLabel(days)}</span>
        <span className="visually-hidden">{formatLong(date)}</span>
      </div>

      {end ? (
        <p className="cal-drawer__where">
          Until {formatLong(end)}
        </p>
      ) : null}

      {where ? (
        <p className={cx('cal-drawer__where', event.type === 'exam' && !event.time && 'is-unset')}>
          <span className="visually-hidden">Time and place: </span>
          {where}
        </p>
      ) : null}

      {module ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-module">
          <h3 id="cal-drawer-module" className="cal-drawer__h">
            Module
          </h3>
          <div className="cal-drawer__module">
            <span className="cal-drawer__module-icon" aria-hidden="true">
              <ModuleIcon moduleId={module.id} weight="duotone" />
            </span>
            <span className="cal-drawer__module-text">
              {module.unitCode || code ? <span className="u-code cal-drawer__module-code">{module.unitCode || code}</span> : null}
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
                  <span className={cx('cal-dot', `cal-dot--${e.type}`)} aria-hidden="true" />
                  <span className="cal-drawer__row-title">{e.title}</span>
                  <CohortBadge year={e.year} variant="dot" size="sm" short />
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
                  <button type="button" className="cal-drawer__row" onClick={() => onOpen(e)} aria-current={current ? 'true' : undefined} disabled={current}>
                    <span className="cal-drawer__row-date u-tabular">{d.getFullYear() === today.getFullYear() ? formatShort(d) : formatShortYear(d)}</span>
                    <span className={cx('cal-dot', `cal-dot--${e.type}`)} aria-hidden="true" />
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
          <b>Not confirmed yet.</b> Check with the programme office before you plan around it.
        </p>
      ) : null}

      <p className="cal-drawer__note">
        {event.time || event.place ? 'Added as an all-day event, with the time and place in its notes.' : 'Added as an all-day event.'}
        {event.type === 'exam' || event.type === 'deadline' ? ' The .ics file includes a reminder at 9:00 the day before.' : ''}
      </p>
      {examsYear !== undefined ? (
        <div className="cal-drawer__exams">
          <AddExamsToCalendar year={examsYear} size="sm" />
        </div>
      ) : null}
    </div>
  );
}
