import { cx } from '../../ui';
import { formatMonthShort, toKey, weekdayOf } from './dates';

export interface DateLeafProps {
  date: Date;
  /** Band colour: an event type ('exam', 'mock', …), 'today' or 'neutral'. */
  tone?: string;
  /** Filled band (the next exam, today). */
  solid?: boolean;
  className?: string;
}

/**
 * A date as a calendar leaf: the weekday on the band, the day number, the month. Every stand-alone
 * date in the calendar feature is one of these, so a date never appears without its day of the week.
 * Decorative (aria-hidden): the host supplies the full date as text for screen readers.
 */
export function DateLeaf({ date, tone = 'neutral', solid = false, className }: DateLeafProps) {
  return (
    <time className={cx('cal-leaf', `cal-leaf--${tone}`, solid && 'is-solid', className)} dateTime={toKey(date)} aria-hidden="true">
      <span className="cal-leaf__wd">{weekdayOf(date).short}</span>
      <span className="cal-leaf__day">{date.getDate()}</span>
      <span className="cal-leaf__mon">{formatMonthShort(date)}</span>
    </time>
  );
}
