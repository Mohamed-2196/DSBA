import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CalendarPlus } from '@phosphor-icons/react';
import type { ModuleSummary } from '../../api/types';
import { cx, IconButton } from '../../ui';
import { countdownLabel, daysUntil, formatLong, formatMonthShort, gapLabel, parseKey, weekdayOf } from './dates';
import { cardText, typeLabel } from './eventMeta';
import type { CalendarEvent } from './types';

const GUTTER = 12;
const CARD = 164; // room a full-size card needs: the row holds as many as fit
const MIN_ROW = 3; // fewer than three across and the board becomes a list
const MAX_ROW = 7;
const LIST_COUNT = 5; // rows in the list (phones)

/** 'the same day as …' · 'the day after …' · '4 days after …' (for screen readers; the picture says '4 days later'). */
function gapSentence(gap: number, prev: CalendarEvent): string {
  const what = prev.unitCode ? `${prev.unitCode} ${typeLabel(prev.type).toLowerCase()}` : prev.title;
  if (gap <= 0) return `the same day as ${what}`;
  if (gap === 1) return `the day after ${what}`;
  return `${gap} days after ${what}`;
}

export interface UpcomingBoardProps {
  /** Everything from today on, by date (the first is what is next). */
  events: CalendarEvent[];
  today: Date;
  onOpen: (e: CalendarEvent) => void;
  onDownload: (e: CalendarEvent) => void;
  getModule: (id: string | null | undefined) => ModuleSummary | null;
}

/**
 * What is next, as date leaves in calendar order, whatever the type: the weekday on a band in the
 * type's colour, the date, what it is, how far away it is and how long after the one before.
 * One row when there is room for it (as many cards as fit), a list otherwise (always on a phone).
 * Each card opens the event's details and can be added to a calendar.
 * data-hub="exam-list".
 */
export function UpcomingBoard({ events, today, onOpen, onDownload, getModule }: UpcomingBoardProps) {
  const ref = useRef<HTMLOListElement>(null);
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

  const fit = Math.min(MAX_ROW, Math.floor((width + GUTTER) / (CARD + GUTTER)));
  const asRow = fit >= MIN_ROW;
  const shown = width > 0 ? events.slice(0, asRow ? fit : LIST_COUNT) : [];
  const n = shown.length;

  return (
    <ol
      ref={ref}
      role="list"
      className={cx('cal-board', asRow ? 'cal-board--row' : 'cal-board--list')}
      style={{ '--n': Math.max(n, asRow ? fit : 1) } as CSSProperties}
      data-hub="exam-list"
      aria-label={n === 1 ? 'The next date on the calendar' : `The next ${n} dates on the calendar, in order`}
    >
      {shown.map((e, i) => {
        const date = parseKey(e.date);
        const days = daysUntil(date, today);
        const prev = i > 0 ? shown[i - 1] : undefined;
        const gap = prev ? daysUntil(date, parseKey(prev.date)) : 0;
        const exams = !!prev && prev.type === 'exam' && e.type === 'exam';
        const { code, name } = cardText(e, getModule(e.moduleId));
        const wd = weekdayOf(date);
        const type = typeLabel(e.type);
        return (
          <li key={e.id} className={cx('cal-up', `cal-tone--${e.type}`, i === 0 && 'is-next', e.type === 'exam' && 'is-exam')}>
            {prev ? (
              <span className={cx('cal-up__gap', exams && gap <= 1 && 'is-tight')} aria-hidden="true">
                <span>{gapLabel(gap, { exams })}</span>
              </span>
            ) : null}
            <button type="button" className="cal-up__open" onClick={() => onOpen(e)} data-event-id={e.id} title={e.title}>
              <span className="cal-up__leaf" aria-hidden="true">
                <span className="cal-up__wd">
                  <span className="cal-up__wd-long">{wd.long}</span>
                  <span className="cal-up__wd-short">{wd.short}</span>
                </span>
                <span className="cal-up__day">{date.getDate()}</span>
                <span className="cal-up__mon">{formatMonthShort(date)}</span>
              </span>
              <span className="cal-up__body">
                <span className="visually-hidden">
                  {i === 0 ? 'Next up: ' : ''}
                  {type}, {e.title}, {formatLong(date)}
                  {e.sample ? ', not confirmed' : ''},{' '}
                </span>
                <span className="cal-up__type" aria-hidden="true">
                  <span className={cx('cal-dot', `cal-dot--${e.type}`)} />
                  {type}
                </span>
                {code ? (
                  <span className="cal-up__code u-code" aria-hidden="true">
                    {code}
                  </span>
                ) : null}
                <span className={cx('cal-up__name', !code && 'is-title')} aria-hidden="true">
                  {name}
                </span>
                {!code && e.year == null ? (
                  <span className="cal-up__for" aria-hidden="true">
                    All years
                  </span>
                ) : null}
                <span className="cal-up__when">{countdownLabel(days)}</span>
                {prev ? <span className="visually-hidden">, {gapSentence(gap, prev)}</span> : null}
              </span>
            </button>
            <IconButton
              className="cal-up__add"
              label={`Add ${e.title} on ${formatLong(date)} to your calendar`}
              icon={CalendarPlus}
              size="sm"
              tooltip
              tooltipSide="top"
              onClick={() => onDownload(e)}
            />
          </li>
        );
      })}
    </ol>
  );
}
