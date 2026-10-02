import { CalendarPlus, DownloadSimple, LinkSimple } from '@phosphor-icons/react';
import { Badge, Button, CohortBadge, cx, Drawer, Highlight, IconButton, ModuleIcon } from '../../ui';
import { BREAKPOINTS, cohortLabel, useMediaQuery } from '../../state';
import { getEventsForModule, EVENTS } from '../../data/calendar.js';
import { countdownLabel, daysUntil, formatLong, formatMonthYear, formatShort, formatShortYear, parseKey, WEEKDAYS } from './dates.js';
import { eventModule, splitTitle, timeAndPlace, TYPE_BADGE_TONE, typeLabel } from './eventMeta.js';

/**
 * Event details: date, type, cohort, time and place when published, linked module, countdown, .ics
 * downloads. Opened from the grid, the agenda, the cards at the top or a ?event=<id> link.
 */
export function EventDrawer({ event, today, year, examCount, onClose, onOpen, onDownload, onDownloadAll, onCopyLink }) {
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
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
            <IconButton label="Copy link to this event" icon={LinkSimple} variant="secondary" tooltip tooltipSide="top" onClick={() => onCopyLink(event)} />
            <span className="cal-drawer__spacer" />
            {examCount > 0 && event.type !== 'thanks' ? (
              <Button leadingIcon={DownloadSimple} onClick={onDownloadAll}>
                {year ? `All ${cohortLabel(year)} exams` : 'All exams'} ({examCount})
              </Button>
            ) : null}
            <Button variant="primary" leadingIcon={CalendarPlus} onClick={() => onDownload(event)}>
              Add to calendar
            </Button>
          </div>
        ) : null
      }
    >
      {event ? <DrawerContent event={event} today={today} onOpen={onOpen} /> : null}
    </Drawer>
  );
}

function DrawerContent({ event, today, onOpen }) {
  const date = parseKey(event.date);
  const days = daysUntil(date, today);
  const module = eventModule(event);
  const { code } = splitTitle(event);
  const sameDay = event.type === 'thanks' ? [] : EVENTS.filter((e) => e.date === event.date && e.id !== event.id);
  const related = module ? getEventsForModule(module.id) : [];
  const where = timeAndPlace(event);

  return (
    <div className="cal-drawer__content">
      <div className="cal-drawer__badges">
        <Badge tone={TYPE_BADGE_TONE[event.type]} className={event.type === 'event' ? 'cal-badge--event' : undefined}>{typeLabel(event.type)}</Badge>
        <CohortBadge year={event.year} />
      </div>

      <div className="cal-drawer__when">
        <span className="cal-drawer__day" aria-hidden="true">{date.getDate()}</span>
        <span className="cal-drawer__datebits">
          <span className="cal-drawer__weekday">{WEEKDAYS[date.getDay()].long}</span>
          <span className="cal-drawer__monthyear">{formatMonthYear(date)}</span>
        </span>
        <span className={cx('cal-drawer__countdown', days < 0 && 'is-past', event.type === 'exam' && days >= 0 && days <= 7 && 'is-soon')}>
          {countdownLabel(days)}
        </span>
        <span className="visually-hidden">{formatLong(date)}</span>
      </div>

      {where ? (
        <p className="cal-drawer__where">
          <span className="visually-hidden">Time and place: </span>
          {where}
        </p>
      ) : null}

      {event.type === 'thanks' ? (
        <section className="cal-drawer__thanks" aria-label="A note from DSBA students">
          <p className="cal-drawer__thanks-big">
            <Highlight animate delay={250}>Thank you.</Highlight>
          </p>
          <p className="cal-drawer__thanks-body">
            For every lecture and every recording, every past paper you marked and every question you answered after
            class: from all of us studying DSBA, happy Teacher’s Day.
          </p>
        </section>
      ) : null}

      {module ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-module">
          <h3 id="cal-drawer-module" className="cal-drawer__h">Module</h3>
          <div className="cal-drawer__module">
            <span className="cal-drawer__module-icon" aria-hidden="true">
              <ModuleIcon moduleId={module.id} weight="duotone" />
            </span>
            <span className="cal-drawer__module-text">
              {module.unitCode || code ? <span className="u-code cal-drawer__module-code">{module.unitCode || code}</span> : null}
              <span className="cal-drawer__module-name">{module.name}</span>
            </span>
            <Button size="sm" to={`/modules/${module.id}`}>Open module</Button>
          </div>
        </section>
      ) : null}

      {sameDay.length ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-same">
          <h3 id="cal-drawer-same" className="cal-drawer__h">Also on this day</h3>
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

      {related.length > 1 ? (
        <section className="cal-drawer__section" aria-labelledby="cal-drawer-related">
          <h3 id="cal-drawer-related" className="cal-drawer__h">Every date for {module.unitCode || module.shortName}</h3>
          <ol role="list" className="cal-drawer__list cal-drawer__timeline">
            {related.map((e) => {
              const d = parseKey(e.date);
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
          <b>Sample date.</b> It follows last year’s pattern and is not confirmed: check with the programme office before you plan around it.
        </p>
      ) : null}

      {event.type === 'thanks' ? null : <p className="cal-drawer__note">
        {event.type === 'exam' ? 'Added as an all-day event. Exam times and venues are not on this calendar.' : where ? 'Added as an all-day event, with the time and place in its notes.' : 'Added as an all-day event.'}
        {event.type === 'exam' || event.type === 'deadline' ? ' The .ics file includes a reminder at 9:00 the day before.' : ''}
      </p>}
    </div>
  );
}
