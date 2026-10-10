import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../../ui';
import { addDays, breakdownLabel, daysBreakdown, daysUntil, formatLong, formatMonthLong, formatShort, inDays, isWeekend, parseKey, startOfDay, toKey, weeksAndDays, WEEKDAYS } from './dates';
import { primaryEvent, stripWord, TYPE_ORDER, typeLabel } from './eventMeta';

const MIN_CELLS = 28; // four weeks: far enough to see what is coming
const MAX_CELLS = 42; // six weeks: past that a day is too narrow to carry its weekday
const TAIL = 1; // an empty day after the last exam
const DIM_H = 30; // the exam measure above the ruler
const DIM_Y = 12; // y of its line
const TICK = 6; // half height of an end tick
const LEAD_H = 18; // leaders from the marked days down to their words
const FLAG_H = 22;
const FLAG_GAP = 8;
const TODAY_W = 108; // "Today, Tue 6 Oct"
const TODAY_W_SHORT = 40; // "Today"
const MAX_SHIFT = 1.6; // a word may slide this many days away from its day before it is dropped instead

const WEEK_NOTE = 'Weekdays are Sunday to Thursday; the weekend is Friday and Saturday.';

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
 * Place as many words as fit under their days. Where they crowd each other, the least important
 * word of that crowd goes (what is next always stays, then the first exam, then the other exams,
 * then the rest) and the others are laid out again, so two words never overlap, none drifts far
 * from its day, and a word with room around it is never dropped for a squeeze somewhere else.
 */
function placeWords(words, lo, hi, maxShift) {
  let set = words;
  while (set.length) {
    const at = spread(set, lo, hi, FLAG_GAP);
    const shift = set.map((f, i) => (at ? Math.abs(at[i] - f.c) : 0));
    if (at && set.every((f, i) => shift[i] <= maxShift || f.keep === 0)) return set.map((f, i) => ({ ...f, at: at[i] }));
    // The crowd: the run of words packed edge to edge around the one pushed furthest (all of them
    // when the row is simply too short).
    let a = 0;
    let b = set.length - 1;
    if (at) {
      const packed = (i) => at[i + 1] - at[i] <= (set[i].w + set[i + 1].w) / 2 + FLAG_GAP + 0.5;
      let far = -1;
      set.forEach((f, i) => {
        if (f.keep > 0 && (far < 0 || shift[i] > shift[far])) far = i;
      });
      a = far;
      b = far;
      while (a > 0 && packed(a - 1)) a -= 1;
      while (b < set.length - 1 && packed(b)) b += 1;
    }
    let drop = -1;
    for (let i = a; i <= b; i += 1) {
      if (set[i].keep > 0 && (drop < 0 || set[i].keep > set[drop].keep || (set[i].keep === set[drop].keep && shift[i] >= shift[drop]))) drop = i;
    }
    if (drop < 0) return at ? set.map((f, i) => ({ ...f, at: at[i] })) : [];
    set = set.filter((_, i) => i !== drop);
  }
  return [];
}

/**
 * What is coming, day by day and to scale: one cell per day from today for at least four weeks (to
 * the end of the exam session when that is further), weeks starting on Sunday, weekends (Friday,
 * Saturday) shaded, today marked. Every day with something on it wears its type's colour on the
 * weekday band, like the date cards below; exam days are filled in full and measured from today on
 * the line above. A picture: the same dates are listed (and opened) in the cards under it.
 * data-hub="exam-track".
 * @param {CalendarEvent[]} events  everything from today on, by date
 * @param {object|null} outlook     getExamOutlook(): { next, ahead, started } or null
 * @param {Date} now
 * @param {string} nextId           id of the event the page is counting down to
 * @param {string} noExams          what to say when no exam is ahead
 */
export function DayStrip({ events, outlook, now, nextId, noExams }) {
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

  // What is drawn (independent of the width).
  const facts = useMemo(() => {
    let exam = null;
    let cells = MIN_CELLS;
    if (outlook) {
      const first = parseKey(outlook.next.date);
      const d1 = daysUntil(first, today);
      const dL = daysUntil(parseKey(outlook.ahead[outlook.ahead.length - 1].date), today);
      const n = outlook.ahead.length;
      const span = dL - d1 + 1;
      exam = {
        d1,
        dL,
        lead: outlook.started || n === 1 ? 'Next exam' : 'First exam',
        when: `${formatShort(first)}, ${inDays(d1)}`,
        rest: n > 1 ? `${n} exams${outlook.started ? ' left' : ''} in ${span} days` : null,
        // The same distance in weeks, weekdays and weekends: '2 weeks and 3 days: 13 weekdays and 2 weekends'.
        units: [weeksAndDays(d1), breakdownLabel(daysBreakdown(today, first))].filter(Boolean).join(': ') || null,
      };
      if (d1 < MAX_CELLS) cells = Math.max(MIN_CELLS, dL + 1 + TAIL);
    }
    cells = Math.min(MAX_CELLS, cells);

    // The days that hold something, in order.
    const days = [];
    events.forEach((e) => {
      const off = daysUntil(parseKey(e.date), today);
      if (off < 0 || off >= cells) return;
      const last = days[days.length - 1];
      if (last && last.off === off) last.events.push(e);
      else days.push({ off, events: [e] });
    });
    days.forEach((d) => {
      d.main = primaryEvent(d.events);
      d.word = stripWord(d.main) + (d.events.length > 1 ? ` +${d.events.length - 1}` : '');
      d.next = d.events.some((e) => e.id === nextId);
    });
    const types = TYPE_ORDER.filter((t) => days.some((d) => d.events.some((e) => e.type === t)));
    return { exam, cells, days, types, count: days.reduce((sum, d) => sum + d.events.length, 0) };
  }, [events, outlook, today, nextId]);

  const layout = useMemo(() => {
    if (!width) return null;
    const { exam, cells, days } = facts;
    const dw = width / cells;
    const x = (d) => (d + 0.5) * dw;
    const mode = dw >= 31 ? 'short' : dw >= 24 ? 'two' : dw >= 18 ? 'one' : 'ticks';

    // The exam measure sits on the strip when both of its labels fit on their spans.
    let dim = null;
    if (exam && exam.d1 > 0 && exam.dL < cells) {
      const leadW = (exam.lead.length + exam.when.length + 2) * 8.6 + 28;
      const restW = exam.rest ? exam.rest.length * 8.8 + 28 : 0;
      const x0 = x(0);
      const x1 = x(exam.d1);
      const xL = x(exam.dL);
      if (x1 - x0 >= leadW + 28 && (!exam.rest || xL - x1 >= restW + 20)) dim = { x0, x1, xL };
    }

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

    // A word under every marked day after today; today's own sits in the "Today" label. The label
    // gives way to the words: it loses its date, then today's word, when a day right after today
    // needs the room (the date is on the cell above it, today's event in the headline).
    const todays = days.find((d) => d.off === 0) || null;
    const wordW = todays ? 22 + todays.word.length * 6.8 : 0;
    const words = days
      .filter((d) => d.off > 0)
      .map((d) => ({
        key: d.off,
        day: d,
        text: d.word,
        c: x(d.off),
        w: d.word.length * (d.main.type === 'exam' ? 8 : 6.8) + 8,
        keep: d.next ? 0 : d.main.type !== 'exam' ? 3 : exam && d.off === exam.d1 ? 1 : 2,
      }));
    const maxShift = Math.max(MAX_SHIFT * dw, 28);
    const labels = [
      { date: true, word: !!todays, w: TODAY_W + wordW },
      { date: false, word: !!todays, w: TODAY_W_SHORT + wordW },
      { date: false, word: false, w: TODAY_W_SHORT },
    ];
    let best = null;
    for (const label of labels) {
      const flags = placeWords(words, label.w + FLAG_GAP, width, maxShift);
      const calm = flags.every((f) => Math.abs(f.at - f.c) <= maxShift);
      // A shorter label wins only when it lets more words in (or stops one being dragged far).
      if (!best || flags.length > best.flags.length || (flags.length === best.flags.length && calm && !best.calm)) best = { label, flags, calm };
      if (calm && flags.length === words.length) break;
    }

    return { dw, mode, dim, marks, flags: best.flags, todays, todayLabel: best.label };
  }, [width, facts, today]);

  const { exam, cells, days, types, count } = facts;
  const byOff = new Map(days.map((d) => [d.off, d]));
  const dim = layout?.dim;
  const examLine = exam ? `${exam.lead}: ${exam.when}${exam.units ? ` (${exam.units})` : ''}${exam.rest ? `. ${exam.rest}` : ''}.` : noExams ? `${noExams}.` : '';
  const unitsNote = exam?.units ? `${exam.units}. ${WEEK_NOTE}` : undefined;
  const label = `The next ${cells} days, day by day from today, ${formatLong(today)}: ${count === 0 ? 'nothing' : count === 1 ? '1 date' : `${count} dates`} on the calendar. ${examLine} The dates are listed below.`;

  return (
    <figure className={cx('cal-strip', layout && `cal-strip--${layout.mode}`)} data-hub="exam-track" aria-label={label}>
      {layout && !dim ? (
        <p className="cal-strip__lede" aria-hidden="true">
          {exam ? (
            <>
              <span title={unitsNote}>
                {exam.lead}: <b>{exam.when}</b>
              </span>
              {exam.rest ? <span>{exam.rest}</span> : null}
            </>
          ) : (
            <span>{noExams}</span>
          )}
        </p>
      ) : null}
      <div ref={ref} className="cal-strip__plot" aria-hidden="true">
        {dim ? (
          <div className="cal-strip__dims" style={{ height: DIM_H }}>
            <svg className="cal-strip__svg" width={width} height={DIM_H}>
              <path className="cal-strip__drop" d={`M${dim.x0} ${DIM_Y + TICK}V${DIM_H}M${dim.x1} ${DIM_Y + TICK}V${DIM_H}${exam.rest ? `M${dim.xL} ${DIM_Y + TICK}V${DIM_H}` : ''}`} />
              <path className="cal-strip__dim" d={`M${dim.x0} ${DIM_Y}H${dim.x1}M${dim.x0} ${DIM_Y - TICK}V${DIM_Y + TICK}M${dim.x1} ${DIM_Y - TICK}V${DIM_Y + TICK}`} />
              {exam.rest ? <path className="cal-strip__dim cal-strip__dim--session" d={`M${dim.x1} ${DIM_Y}H${dim.xL}M${dim.xL} ${DIM_Y - TICK}V${DIM_Y + TICK}`} /> : null}
            </svg>
            <span className="cal-strip__measure" style={{ left: (dim.x0 + dim.x1) / 2, top: DIM_Y }} title={unitsNote}>
              {exam.lead}: <b>{exam.when}</b>
            </span>
            {exam.rest ? (
              <span className="cal-strip__measure cal-strip__measure--session" style={{ left: (dim.x1 + dim.xL) / 2, top: DIM_Y }}>
                {exam.rest}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="cal-strip__marks">
          {layout
            ? layout.marks.map((m) => (
                <span key={m.left} className="cal-strip__mark" style={{ left: m.left }}>
                  {m.text}
                </span>
              ))
            : null}
        </div>

        <ol role="list" className="cal-strip__ruler">
          {Array.from({ length: cells }, (_, i) => {
            const d = addDays(today, i);
            const wd = WEEKDAYS[d.getDay()];
            const day = byOff.get(i);
            return (
              <li
                key={toKey(d)}
                className={cx(
                  'cal-strip__cell',
                  isWeekend(d) && 'is-weekend',
                  d.getDay() === 0 && i > 0 && 'is-weekstart',
                  i === 0 && 'is-today',
                  day && 'has-event',
                  day && `cal-tone--${day.main.type}`,
                  day && day.main.type === 'exam' && 'is-exam',
                )}
                title={day ? `${formatShort(d)}: ${day.events.map((e) => `${e.title} (${typeLabel(e.type)})`).join('; ')}` : undefined}
              >
                {layout && layout.mode !== 'ticks' ? (
                  <>
                    <span className="cal-strip__wd">{wd[layout.mode]}</span>
                    <span className="cal-strip__num">{d.getDate()}</span>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="cal-strip__flags" style={{ height: LEAD_H + FLAG_H }}>
          {layout ? (
            <>
              <svg className="cal-strip__svg" width={width} height={LEAD_H}>
                <path className="cal-strip__lead" d={`M${layout.dw / 2} 0V${LEAD_H}`} />
                {layout.flags.map((f) => (
                  <path key={f.key} className="cal-strip__lead" d={`M${f.c} 0V4L${f.at} ${LEAD_H - 4}V${LEAD_H}`} />
                ))}
              </svg>
              <span className="cal-strip__today" style={{ top: LEAD_H }}>
                <b>Today</b>
                {layout.todayLabel.date ? `, ${formatShort(today)}` : null}
                {layout.todayLabel.word ? (
                  <span className="cal-strip__todays">
                    <span className={cx('cal-dot', `cal-dot--${layout.todays.main.type}`)} />
                    {layout.todays.word}
                  </span>
                ) : null}
              </span>
              {layout.flags.map((f) => (
                <span
                  key={f.key}
                  className={cx('cal-strip__flag', f.day.main.type === 'exam' && 'is-exam u-code', f.day.next && 'is-next')}
                  style={{ left: f.at, top: LEAD_H, width: f.w }}
                >
                  {f.text}
                </span>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {types.length ? (
        <ul role="list" className="cal-strip__legend" aria-hidden="true">
          {types.map((t) => (
            <li key={t}>
              <span className={cx('cal-dot', `cal-dot--${t}`)} />
              {typeLabel(t)}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
