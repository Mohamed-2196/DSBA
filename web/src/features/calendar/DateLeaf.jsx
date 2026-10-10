import { cx } from '../../ui';
import { formatMonthShort, toKey, WEEKDAYS } from './dates';

/**
 * A date as a calendar leaf: the weekday on the band, the day number, the month. Every stand-alone
 * date in the calendar feature is one of these, so a date never appears without its day of the week.
 * Decorative (aria-hidden): the host supplies the full date as text for screen readers.
 * @param {Date} date
 * @param {string} tone    band colour: an event type ('exam', 'mock', …), 'today' or 'neutral'
 * @param {boolean} solid  filled band (the next exam, today)
 */
export function DateLeaf({ date, tone = 'neutral', solid = false, className }) {
  return (
    <time className={cx('cal-leaf', `cal-leaf--${tone}`, solid && 'is-solid', className)} dateTime={toKey(date)} aria-hidden="true">
      <span className="cal-leaf__wd">{WEEKDAYS[date.getDay()].short}</span>
      <span className="cal-leaf__day">{date.getDate()}</span>
      <span className="cal-leaf__mon">{formatMonthShort(date)}</span>
    </time>
  );
}
