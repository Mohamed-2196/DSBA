import { useLayoutEffect, useRef, useState } from 'react';
import { CalendarPlus } from '@phosphor-icons/react';
import { cx, IconButton } from '../../ui';
import { countdownLabel, daysUntil, formatLong, formatMonthShort, gapLabel, parseKey, WEEKDAYS } from './dates.js';
import { eventModule, splitTitle } from './eventMeta.js';

const GUTTER = 12;
const CARD = 150; // a full-size card
const MIN_CARD = 118; // narrower than this per exam and the board becomes a list

/** 'the day after ST2134' · '4 days after ST2134' (for screen readers; the picture says '4 days later'). */
function gapSentence(gap, prev) {
  const what = prev.unitCode || 'the exam before';
  if (gap <= 0) return `the same day as ${what}`;
  if (gap === 1) return `the day after ${what}`;
  return `${gap} days after ${what}`;
}

/**
 * The session's exams as date leaves, in order: the weekday first, then the date, the module, how
 * far away it is, and how long after the exam before it. One row when there is room for it, a list
 * otherwise (always on a phone). Each exam opens its details and can be added to a calendar.
 * data-hub="exam-list".
 * @param {CalendarEvent[]} session  every exam of the session, by date (past ones included)
 * @param {CalendarEvent} next       the exam being counted down to
 * @param {Date} today
 */
export function ExamBoard({ session, next, today, onOpen, onDownload }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = session.length;
  const card = width > 0 ? (width - (n - 1) * GUTTER) / n : 0;
  const asRow = card >= MIN_CARD;

  return (
    <ol
      ref={ref}
      role="list"
      className={cx('cal-board', asRow ? 'cal-board--row' : 'cal-board--list', asRow && card < CARD && 'cal-board--compact')}
      style={{ '--n': n }}
      data-hub="exam-list"
      aria-label={`The ${n === 1 ? 'exam' : `${n} exams`} of this session, in order`}
    >
      {session.map((e, i) => {
        const date = parseKey(e.date);
        const days = daysUntil(date, today);
        const past = days < 0;
        const prev = i > 0 ? session[i - 1] : null;
        const gap = prev ? daysUntil(date, parseKey(prev.date)) : null;
        const module = eventModule(e);
        const name = module ? module.shortName : splitTitle(e).rest;
        const wd = WEEKDAYS[date.getDay()];
        const what = `${e.unitCode ? `${e.unitCode} ` : ''}${module ? module.name : splitTitle(e).rest}`;
        return (
          <li key={e.id} className={cx('cal-exam', e.id === next.id && 'is-next', past && 'is-past')}>
            {prev ? (
              <span className={cx('cal-exam__gap', gap <= 1 && 'is-tight')} aria-hidden="true">
                <span>{gapLabel(gap)}</span>
              </span>
            ) : null}
            <button type="button" className="cal-exam__open" onClick={() => onOpen(e)} data-event-id={e.id}>
              <span className="cal-exam__leaf" aria-hidden="true">
                <span className="cal-exam__wd">
                  <span className="cal-exam__wd-long">{wd.long}</span>
                  <span className="cal-exam__wd-short">{wd.short}</span>
                </span>
                <span className="cal-exam__day">{date.getDate()}</span>
                <span className="cal-exam__mon">{formatMonthShort(date)}</span>
              </span>
              <span className="cal-exam__body">
                <span className="visually-hidden">
                  {e.id === next.id ? 'Next exam: ' : ''}
                  {what}, {formatLong(date)},{' '}
                </span>
                {e.unitCode ? <span className="cal-exam__code u-code" aria-hidden="true">{e.unitCode}</span> : null}
                <span className="cal-exam__name" aria-hidden="true">{name}</span>
                <span className="cal-exam__when">{countdownLabel(days)}</span>
                {prev ? <span className="visually-hidden">, {gapSentence(gap, prev)}</span> : null}
              </span>
            </button>
            {!past ? (
              <IconButton
                className="cal-exam__add"
                label={`Add the ${e.unitCode || name} exam on ${formatLong(date)} to your calendar`}
                icon={CalendarPlus}
                size="sm"
                tooltip
                tooltipSide="top"
                onClick={() => onDownload(e)}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
