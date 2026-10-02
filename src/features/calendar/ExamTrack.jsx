import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx, Highlight } from '../../ui';
import { addDays, breakdownLabel, daysBreakdown, daysUntil, formatLong, formatMonthLong, formatShort, isWeekend, parseKey, startOfDay, toKey, weeksAndDays, WEEKDAYS } from './dates.js';
import { eventModule } from './eventMeta.js';

const MIN_CELLS = 15; // at least a fortnight, so one day never gets absurdly wide
const TAIL = 1; // empty days after the last exam
const DIM_H = 104; // the measured spans above the ruler, with their labels
const DIM_Y = 34; // y of the dimension line (the highlighted count is centred on it)
const DIM_H_SLIM = 26; // the same without labels (they move into the lede)
const DIM_Y_SLIM = 10;
const TICK = 7; // half height of a dimension end tick
const LEAD_H = 18; // leaders from the exam days down to their codes
const FLAG_H = 22;
const FLAG_GAP = 8;
const TODAY_W = 108; // "Today, Tue 6 Oct"

const WEEK_NOTE = 'Weekdays are Sunday to Thursday; the weekend is Friday and Saturday.';

const flagText = (e) => e.unitCode || eventModule(e)?.shortName || 'Exam';

/**
 * Lay labels out on one row, each as close to its day as it can be without overlapping its
 * neighbours or leaving [lo, hi]. items: [{ c: wanted centre, w: width }] sorted by c.
 * Returns the centres, or null when they cannot all fit.
 */
function spread(items, lo, hi, gap) {
  const total = items.reduce((sum, it) => sum + it.w, 0) + gap * (items.length - 1);
  if (!items.length || total > hi - lo) return null;
  const out = [];
  items.forEach((it, i) => {
    const min = i ? out[i - 1] + (items[i - 1].w + it.w) / 2 + gap : lo + it.w / 2;
    out.push(Math.max(it.c, min));
  });
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const max = i === items.length - 1 ? hi - items[i].w / 2 : out[i + 1] - (items[i].w + items[i + 1].w) / 2 - gap;
    if (out[i] > max) out[i] = max;
  }
  return out;
}

/**
 * The road to the exams, drawn to scale: one cell per day from today to the last exam of the
 * session, weekends (Friday, Saturday) shaded, weeks starting on Sunday. The distance to the next
 * exam is measured over it in days, weeks and weekends; the session's length is measured next to it.
 * A picture: the exams themselves are listed (and opened) in the board under it.
 * data-hub="exam-track".
 * @param {CalendarEvent[]} exams  the session's exams from today on, by date (the first is the next)
 * @param {Date} now
 */
export function ExamTrack({ exams, now }) {
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

  const todayT = startOfDay(now).getTime();
  const today = useMemo(() => new Date(todayT), [todayT]);

  // What is measured (independent of the width).
  const facts = useMemo(() => {
    const offs = exams.map((e) => daysUntil(parseKey(e.date), today));
    const days = offs[0];
    const last = offs[offs.length - 1];
    const count = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`;
    const units = [weeksAndDays(days), breakdownLabel(daysBreakdown(today, parseKey(exams[0].date)))].filter(Boolean).join(': ');
    const span = last - days + 1;
    const session = exams.length > 1 ? `${exams.length} exams in ${span} ${span === 1 ? 'day' : 'days'}` : null;
    return { offs, days, last, count, units, session, cells: Math.max(MIN_CELLS, last + 1 + TAIL) };
  }, [exams, today]);

  const layout = useMemo(() => {
    if (!width) return null;
    const { offs, days, last, count, units, session, cells } = facts;
    const dw = width / cells;
    const x = (d) => (d + 0.5) * dw;
    const x0 = x(0);
    const x1 = x(days);
    const xL = x(last);
    const mode = dw >= 33 ? 'short' : dw >= 24 ? 'two' : dw >= 15 ? 'one' : 'ticks';

    // The distance, written on its span when it fits; otherwise above the track. The units sit under
    // the span and may run past its ends (never past the track's).
    const countW = count.length * 27 + 40;
    const unitsW = units.length * 8.2 + 16;
    const inline = days > 0 && x1 - x0 >= countW + 44 && unitsW <= width;
    const unitsX = Math.min(Math.max((x0 + x1) / 2, unitsW / 2), width - unitsW / 2);
    const sessionW = session ? session.length * 9 + 32 : 0;
    const sessionInline = inline && !!session && xL - x1 >= sessionW + 20;

    // Month names over the first day of each month (and the first cell); week starts when the days
    // are too narrow to be written out.
    let marks = [];
    for (let i = 0; i < cells; i += 1) {
      const d = addDays(today, i);
      if (mode === 'ticks') {
        if (d.getDay() === 0 && i > 0) marks.push({ left: i * dw, text: formatShort(d), w: 66 });
      } else if (i === 0 || d.getDate() === 1) marks.push({ left: i * dw, text: formatMonthLong(d), w: 70 });
    }
    if (mode === 'ticks') {
      const every = Math.max(1, Math.ceil(74 / (7 * dw)));
      marks = marks.filter((_, i) => i % every === 0);
    } else {
      marks = marks.filter((m, i) => i === marks.length - 1 || marks[i + 1].left - m.left >= m.w + 8);
    }
    marks = marks.filter((m) => m.left + m.w <= width);

    // Unit codes under their days: all of them when they fit, else the next and the last, else the next.
    const all = exams.map((e, i) => ({ e, c: x(offs[i]), w: flagText(e).length * 8 + 8 }));
    const lo = TODAY_W + FLAG_GAP;
    const tries = [all, all.length > 2 ? [all[0], all[all.length - 1]] : null, [all[0]]].filter(Boolean);
    let flags = [];
    for (const set of tries) {
      const at = spread(set, lo, width, FLAG_GAP);
      if (at) {
        flags = set.map((f, i) => ({ ...f, at: at[i] }));
        break;
      }
    }

    return { dw, x0, x1, xL, mode, inline, unitsX, sessionInline, marks, flags };
  }, [width, facts, exams, today]);

  const { offs, days, count, units, session, cells } = facts;
  const examDay = new Map(offs.map((d, i) => [d, i]));
  const inline = layout?.inline;
  const dimH = days === 0 ? 0 : inline ? DIM_H : DIM_H_SLIM;
  const dimY = inline ? DIM_Y : DIM_Y_SLIM;
  const next = exams[0];
  const label = `The road to your exams, to scale: ${count === 'Today' || count === 'Tomorrow' ? count.toLowerCase() : `${count} from today`} to ${flagText(next)} on ${formatLong(parseKey(next.date))}${units ? ` (${units})` : ''}${session ? `, then ${session}` : ''}.`;

  return (
    <figure className={cx('cal-track', layout && `cal-track--${layout.mode}`)} data-hub="exam-track" aria-label={label}>
      {layout && !inline ? (
        <p className="cal-track__lede" aria-hidden="true">
          <span className="cal-track__lede-count">
            <Highlight as="span">{count}</Highlight>
          </span>
          {units ? <span title={WEEK_NOTE}>{units}</span> : null}
          {session ? <span>{days > 0 ? `Then ${session}` : session}</span> : null}
        </p>
      ) : null}
      <div ref={ref} className="cal-track__plot" aria-hidden="true">
        <div className="cal-track__dims" style={{ height: dimH }}>
          {layout && days > 0 ? (
            <>
              <svg className="cal-track__svg" width={width} height={dimH}>
                <path className="cal-track__drop" d={`M${layout.x0} ${dimY + TICK}V${dimH}M${layout.x1} ${dimY + TICK}V${dimH}`} />
                <path className="cal-track__dim" d={`M${layout.x0} ${dimY}H${layout.x1}M${layout.x0} ${dimY - TICK}V${dimY + TICK}M${layout.x1} ${dimY - TICK}V${dimY + TICK}`} />
                {layout.sessionInline ? (
                  <>
                    <path className="cal-track__drop" d={`M${layout.xL} ${dimY + TICK}V${dimH}`} />
                    <path className="cal-track__dim cal-track__dim--session" d={`M${layout.x1} ${dimY}H${layout.xL}M${layout.xL} ${dimY - TICK}V${dimY + TICK}`} />
                  </>
                ) : null}
              </svg>
              {inline ? (
                <>
                  <span className="cal-track__count" style={{ left: (layout.x0 + layout.x1) / 2, top: dimY }}>
                    <Highlight as="span">{count}</Highlight>
                  </span>
                  {units ? (
                    <span className="cal-track__units" style={{ left: layout.unitsX, top: dimY + 36 }} title={WEEK_NOTE}>
                      {units}
                    </span>
                  ) : null}
                </>
              ) : null}
              {layout.sessionInline ? (
                <span className="cal-track__session" style={{ left: (layout.x1 + layout.xL) / 2, top: dimY }}>
                  {session}
                </span>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="cal-track__marks">
          {layout
            ? layout.marks.map((m) => (
                <span key={m.left} className="cal-track__mark" style={{ left: m.left }}>
                  {m.text}
                </span>
              ))
            : null}
        </div>

        <ol role="list" className="cal-track__ruler">
          {Array.from({ length: cells }, (_, i) => {
            const d = addDays(today, i);
            const wd = WEEKDAYS[d.getDay()];
            const isExam = examDay.has(i);
            return (
              <li
                key={toKey(d)}
                className={cx('cal-track__cell', isWeekend(d) && 'is-weekend', d.getDay() === 0 && i > 0 && 'is-weekstart', i === 0 && 'is-today', isExam && 'is-exam', isExam && examDay.get(i) === 0 && 'is-next')}
              >
                {layout && layout.mode !== 'ticks' ? (
                  <>
                    <span className="cal-track__wd">{wd[layout.mode]}</span>
                    <span className="cal-track__num">{d.getDate()}</span>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="cal-track__flags" style={{ height: LEAD_H + FLAG_H }}>
          {layout ? (
            <>
              <svg className="cal-track__svg" width={width} height={LEAD_H}>
                {layout.flags.map((f) =>
                  // No leader from a day that sits over the "Today" label (an exam today): it would cross it.
                  f.c < TODAY_W ? null : <path key={f.e.id} className="cal-track__lead" d={`M${f.c} 0V4L${f.at} ${LEAD_H - 4}V${LEAD_H}`} />,
                )}
              </svg>
              <span className="cal-track__today" style={{ top: LEAD_H - 12 }}>
                <b>Today</b>, {formatShort(today)}
              </span>
              {layout.flags.map((f) => (
                <span key={f.e.id} className={cx('cal-track__flag', 'u-code', f.e.id === next.id && 'is-next')} style={{ left: f.at, top: LEAD_H, width: f.w }}>
                  {flagText(f.e)}
                </span>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </figure>
  );
}
