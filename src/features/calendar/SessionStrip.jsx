import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx, Highlight } from '../../ui';
import { countdownLabel, daysUntil, DAY_MS, formatDayMonth, formatLong, formatShort, parseKey, startOfDay } from './dates.js';
import { eventModule } from './eventMeta.js';

// The brand trace around its spike, as [dx, dy] from (peak x, baseline): the same shape as the
// HubMark logo path, stretched. The exam you're counting down to is the spike.
const SPIKE = [[-11.1, 0], [-8.6, -2.4], [-6.1, 0.8], [-3.4, -0.6], [0, -11.6], [4, 5.6], [7, -2.6], [10, 0.4], [13.6, -1.4], [17.4, 0]];
const SX = 2;
const SY = 3.1;
const BASE_Y = 86; // baseline of the trace
const BRACKET_Y = 22; // the dimension line ("17 days")
const LABEL_TOP = 116; // first row of exam labels
const ROW_H = 40;
const PAD_L = 8;
const PAD_R = 28;
const LABEL_W = 60; // a unit code at 14px/800 plus a little air
const LABEL_GAP = 8;

/**
 * Timeline of an exam session: today on the left, every exam of the session as a dot, the next one
 * as the spike, and the countdown drawn as a measured span from today to it.
 * @param {CalendarEvent[]} session   the session's exams, by date
 * @param {CalendarEvent} next        the exam being counted down to
 * @param {Date} now
 * @param {(e) => void} onOpen        open an exam's details
 */
export function SessionStrip({ session, next, now, onOpen }) {
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
  const layout = useMemo(() => {
    if (!width || !next) return null;
    const dates = session.map((e) => parseKey(e.date));
    const start = Math.min(today.getTime(), dates[0].getTime());
    const end = Math.max(dates[dates.length - 1].getTime(), parseKey(next.date).getTime(), start + DAY_MS);
    const span = end - start;
    const x = (t) => PAD_L + ((t - start) / span) * (width - PAD_L - PAD_R);

    const todayX = x(today.getTime());
    const nextX = x(parseKey(next.date).getTime());
    const days = daysUntil(next.date, today);

    // Trace: history (before today) quiet, the rest is the trace; the next exam is the spike.
    const pts = SPIKE.map(([dx, dy]) => [nextX + dx * SX, BASE_Y + dy * SY]);
    const startX = x(start);
    const endX = x(end) + PAD_R - 6;
    const spikeIn = pts[0][0];
    const spikeOut = pts[pts.length - 1][0];
    const fStart = Math.min(todayX, spikeIn);
    const future = `M${fStart.toFixed(1)} ${BASE_Y} H${spikeIn.toFixed(1)} ${pts.map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')} H${Math.max(endX, spikeOut).toFixed(1)}`;
    const history = fStart > startX + 1 ? `M${startX.toFixed(1)} ${BASE_Y} H${fStart.toFixed(1)}` : null;

    // Day ticks (skip the ones under the spike or a marker).
    const ticks = [];
    for (let t = start; t <= end; t += DAY_MS) {
      const tx = x(t);
      if (Math.abs(tx - nextX) < 30) continue;
      ticks.push({ x: tx, major: new Date(t).getDate() === 1 });
    }

    // Labels: today first, then exams; greedy rows so codes never collide. Narrow strips keep
    // only the essentials (today, the next exam, the last exam).
    const narrow = width < 560;
    const items = [{ id: 'today', x: todayX, w: 74, align: 'start' }];
    session.forEach((e) => {
      const ex = x(parseKey(e.date).getTime());
      const important = e.id === next.id || e.id === session[session.length - 1].id;
      items.push({ id: e.id, x: ex, w: LABEL_W, event: e, hidden: narrow && !important });
    });
    const rows = [];
    items.forEach((it) => {
      if (it.hidden) return;
      const left = it.align === 'start' ? it.x - 4 : Math.max(0, Math.min(width - it.w, it.x - it.w / 2));
      it.left = left;
      let row = rows.findIndex((r) => r + LABEL_GAP <= left);
      if (row === -1 && rows.length < 3) row = rows.length;
      if (row === -1) {
        it.hidden = true;
        return;
      }
      rows[row] = left + it.w;
      it.row = row;
    });
    const rowCount = Math.max(1, rows.length);

    // The countdown: centred on the measured span when it fits, else beside the spike, else at the start.
    const text = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`;
    const textW = text.length * 13.5 + 34;
    let count;
    if (days > 0 && nextX - todayX >= textW + 16) count = { style: { left: (todayX + nextX) / 2 }, beside: false };
    else if (nextX + 22 + textW < width) count = { style: { left: nextX + 22 }, beside: true };
    else count = { style: { left: 0 }, beside: true };
    const bracket = days > 0 && !count.beside ? { x1: todayX, x2: nextX } : days > 0 ? { x1: todayX, x2: nextX, short: true } : null;

    return { x, todayX, nextX, days, future, history, ticks, items, height: LABEL_TOP + rowCount * ROW_H, bracket, count, text };
  }, [width, session, next, today]);

  return (
    <figure className="cal-strip" aria-label={`Exam session timeline: ${session.length} exam${session.length === 1 ? '' : 's'}, the next ${countdownLabel(daysUntil(next.date, today)).toLowerCase()}`}>
      <div ref={ref} className="cal-strip__plot" style={{ height: layout ? layout.height : LABEL_TOP + ROW_H }}>
        {layout ? (
          <>
            <svg className="cal-strip__svg" width={width} height={layout.height} aria-hidden="true">
              {layout.ticks.map((t) => (
                <line key={t.x} className={cx('cal-strip__tick', t.major && 'is-major')} x1={t.x} x2={t.x} y1={BASE_Y + 6} y2={BASE_Y + (t.major ? 14 : 10)} />
              ))}
              {layout.bracket ? (
                <g className="cal-strip__bracket">
                  <line x1={layout.bracket.x1} x2={layout.bracket.x2} y1={BRACKET_Y} y2={BRACKET_Y} />
                  <line x1={layout.bracket.x1} x2={layout.bracket.x1} y1={BRACKET_Y - 6} y2={BRACKET_Y + 6} />
                  <line x1={layout.bracket.x2} x2={layout.bracket.x2} y1={BRACKET_Y - 6} y2={BRACKET_Y + 6} />
                  <line className="cal-strip__leader" x1={layout.bracket.x1} x2={layout.bracket.x1} y1={BRACKET_Y + 6} y2={BASE_Y - 10} />
                  <line className="cal-strip__leader" x1={layout.bracket.x2} x2={layout.bracket.x2} y1={BRACKET_Y + 6} y2={BASE_Y - 11.6 * SY - 9} />
                </g>
              ) : null}
              {layout.history ? <path className="cal-strip__history" d={layout.history} /> : null}
              <path className="cal-strip__trace" d={layout.future} />
              {session.map((e) => {
                if (e.id === next.id) return null;
                const ex = layout.x(parseKey(e.date).getTime());
                const past = parseKey(e.date) < today;
                return <circle key={e.id} className={cx('cal-strip__dot', past && 'is-past')} cx={ex} cy={BASE_Y} r={past ? 4 : 5} />;
              })}
              <circle className="cal-strip__peak" cx={layout.nextX} cy={BASE_Y - 11.6 * SY} r={5.5} />
              <circle className="cal-strip__now" cx={layout.todayX} cy={BASE_Y} r={6} />
            </svg>

            <span className={cx('cal-strip__count', layout.count.beside && 'is-beside')} style={layout.count.style}>
              <Highlight as="span">{layout.text}</Highlight>
            </span>

            {layout.items.map((it) => {
              if (it.hidden || it.left == null) return null;
              const style = { left: it.left, top: LABEL_TOP + it.row * ROW_H, width: it.w };
              if (it.id === 'today') {
                return (
                  <span key="today" className="cal-strip__label cal-strip__label--today" style={style}>
                    <span className="cal-strip__label-main">Today</span>
                    <span className="cal-strip__label-sub">{formatShort(today)}</span>
                  </span>
                );
              }
              const e = it.event;
              const d = parseKey(e.date);
              const m = eventModule(e);
              return (
                <button
                  key={e.id}
                  type="button"
                  className={cx('cal-strip__label', e.id === next.id && 'is-next', d < today && 'is-past')}
                  style={style}
                  onClick={() => onOpen(e)}
                  aria-label={`${e.unitCode || ''} ${m ? m.name : e.title}, ${formatLong(d)}, ${countdownLabel(daysUntil(d, today)).toLowerCase()}`}
                >
                  <span className="cal-strip__label-main u-code">{e.unitCode || m?.shortName || 'Exam'}</span>
                  <span className="cal-strip__label-sub">{formatDayMonth(d)}</span>
                </button>
              );
            })}
          </>
        ) : null}
      </div>
    </figure>
  );
}
