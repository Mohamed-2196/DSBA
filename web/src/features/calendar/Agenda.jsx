import { Fragment } from 'react';
import { CohortBadge, cx } from '../../ui';
import { DateLeaf } from './DateLeaf';
import { countdownLabel, daysUntil, formatLong, formatShort, monthName, parseKey, toKey } from './dates';
import { splitTitle, timeAndPlace, typeLabel } from './eventMeta';

/**
 * The month as a list: one row per day with events, a "today" rule between past and upcoming.
 * Desktop: next to the grid. Mobile: the whole calendar. data-hub="calendar-agenda".
 */
export function Agenda({ month, events, today, selectedId, showCohort, onOpen, empty, footer, titleId = 'cal-agenda-title' }) {
  const todayKey = toKey(today);
  const days = [];
  events.forEach((e) => {
    const last = days[days.length - 1];
    if (last && last.key === e.date) last.events.push(e);
    else days.push({ key: e.date, date: parseKey(e.date), events: [e] });
  });
  const isThisMonth = today.getMonth() === month.m && today.getFullYear() === month.y;
  // The "today" rule goes before the first day that is today or later.
  const nowIndex = isThisMonth ? days.findIndex((d) => d.key >= todayKey) : -1;
  const ruleAt = isThisMonth ? (nowIndex === -1 ? days.length : nowIndex) : -1;
  const n = events.length;

  return (
    <section className="cal-agenda" data-hub="calendar-agenda" aria-labelledby={titleId}>
      <h3 id={titleId} className="cal-agenda__title">
        {n ? `${n} ${n === 1 ? 'event' : 'events'} in ${monthName(month)}` : `Nothing in ${monthName(month)}`}
      </h3>
      {n ? (
        <ol role="list" className="cal-agenda__list">
          {days.map((day, i) => (
            <Fragment key={day.key}>
              {i === ruleAt ? <TodayRule today={today} /> : null}
              <li className={cx('cal-agenda__day', day.date < today && 'is-past', day.key === todayKey && 'is-today')}>
                <DateLeaf date={day.date} tone={day.key === todayKey ? 'today' : day.events.every((e) => e.type === day.events[0].type) ? day.events[0].type : 'neutral'} solid={day.key === todayKey} className="cal-agenda__date" />
                <ul role="list" className="cal-agenda__events">
                  {day.events.map((e) => {
                    const { code, rest } = splitTitle(e);
                    const d = daysUntil(day.date, today);
                    const where = timeAndPlace(e);
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          className={cx('cal-agenda__event', `cal-agenda__event--${e.type}`, e.id === selectedId && 'is-selected')}
                          onClick={() => onOpen(e)}
                          data-hub="calendar-event"
                          data-event-id={e.id}
                        >
                          <span className="visually-hidden">{formatLong(day.date)}: </span>
                          <span className="cal-agenda__meta">
                            <span className={cx('cal-agenda__type', `cal-agenda__type--${e.type}`)}>
                              <span className={cx('cal-dot', `cal-dot--${e.type}`)} aria-hidden="true" />
                              {typeLabel(e.type)}
                            </span>
                            {showCohort ? <CohortBadge year={e.year} variant="dot" size="sm" short /> : null}
                            <span className="cal-agenda__when">{countdownLabel(d)}</span>
                          </span>
                          <span className="cal-agenda__name">
                            {code ? <span className="u-code">{code} </span> : null}
                            {rest}
                          </span>
                          {where ? <span className="cal-agenda__where">{where}</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            </Fragment>
          ))}
          {ruleAt === days.length ? <TodayRule today={today} /> : null}
        </ol>
      ) : (
        empty
      )}
      {footer}
    </section>
  );
}

function TodayRule({ today }) {
  return (
    <li className="cal-agenda__now">
      <span className="cal-agenda__now-dot" aria-hidden="true" />
      <span>Today, {formatShort(today)}</span>
    </li>
  );
}
