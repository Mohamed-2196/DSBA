import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../../../../ui';

// Label placement per annotated day (relative to its point), two short lines each.
const NOTE_LAYOUT = {
  21: { anchor: 'start', dx: 12, dy: -34 },
  17: { anchor: 'end', dx: -12, dy: 26 },
  9: { anchor: 'end', dx: -12, dy: -36 },
  0: { anchor: 'end', dx: -10, dy: 28 },
};
// Two short lines per label: break between sentences when there are two, else near the middle.
const splitNote = (text) => {
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length === 2) return sentences.map((s) => s.trim());
  const words = text.split(' ');
  if (words.length < 3) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
};

function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** "Chart of the week": one series, days-to-exam (21 → 0) against confidence (0–100%). */
export function ChartOfTheWeek({ chart }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState(null); // index into points
  const narrow = width > 0 && width < 520;
  const height = narrow ? 260 : 300;
  const m = { top: 24, right: narrow ? 10 : 16, bottom: 44, left: narrow ? 34 : 44 };
  const pw = Math.max(0, width - m.left - m.right);
  const ph = height - m.top - m.bottom;
  const maxDay = chart.points[0][0];
  const x = (d) => m.left + ((maxDay - d) / maxDay) * pw;
  const y = (v) => m.top + (1 - v / 100) * ph;

  const notes = useMemo(() => new Map(chart.notes.map((n) => [n.day, n.text])), [chart.notes]);
  const line = chart.points.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(0).toFixed(1)} ${y(0).toFixed(1)}L${x(maxDay).toFixed(1)} ${y(0).toFixed(1)}Z`;

  const pick = (clientX) => {
    const r = wrapRef.current.getBoundingClientRect();
    const px = clientX - r.left;
    const d = Math.round(maxDay - ((px - m.left) / pw) * maxDay);
    const clamped = Math.max(0, Math.min(maxDay, d));
    setActive(chart.points.findIndex(([day]) => day === clamped));
  };
  const onKeyDown = (e) => {
    const last = chart.points.length - 1;
    if (e.key === 'ArrowRight') setActive((i) => (i == null ? 0 : Math.min(last, i + 1)));
    else if (e.key === 'ArrowLeft') setActive((i) => (i == null ? last : Math.max(0, i - 1)));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  const cur = active != null ? chart.points[active] : null;
  const tip = cur
    ? {
        left: Math.min(Math.max(x(cur[0]), 90), width - 90),
        top: y(cur[1]),
        days: cur[0] === 0 ? 'Exam day' : `${cur[0]} ${cur[0] === 1 ? 'day' : 'days'} to go`,
        value: `${cur[1]}% confident`,
        note: notes.get(cur[0]),
      }
    : null;
  const low = chart.points.reduce((a, b) => (b[1] < a[1] ? b : a));

  return (
    <figure className="nl-chart" aria-labelledby="nl-chart-title">
      <figcaption id="nl-chart-title" className="nl-chart__title">
        {chart.title}
      </figcaption>
      <p className="visually-hidden" id="nl-chart-summary">
        Line chart. Confidence starts at {chart.points[0][1]}% three weeks out, falls to {low[1]}% with {low[0]} days to go, recovers to{' '}
        {chart.points[chart.points.length - 2][1]}% the day before, then drops to {chart.points[chart.points.length - 1][1]}% on exam day. Use the arrow keys to read each day.
      </p>
      <div
        ref={wrapRef}
        className="nl-chart__plot"
        tabIndex={0}
        role="img"
        aria-label={chart.title}
        aria-describedby="nl-chart-summary"
        onPointerMove={(e) => pw > 0 && pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((i) => i ?? chart.points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
        style={{ height }}
      >
        {width > 0 ? (
          <svg width={width} height={height} className="nl-chart__svg" aria-hidden="true" focusable="false">
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} className={cx('nl-chart__grid', v === 0 && 'is-base')} />
                <text x={m.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="nl-chart__tick">
                  {v === 100 ? '100%' : v}
                </text>
              </g>
            ))}
            {[21, 14, 7, 0].map((d) => (
              <text key={d} x={x(d)} y={height - m.bottom + 20} textAnchor={d === maxDay ? 'start' : d === 0 ? 'end' : 'middle'} className="nl-chart__tick">
                {d === 0 ? 'Exam day' : d === maxDay ? `${d} days` : d}
              </text>
            ))}
            <text x={m.left + pw / 2} y={height - 4} textAnchor="middle" className="nl-chart__axis-title">
              {chart.xLabel}
            </text>
            <path d={area} className="nl-chart__area" />
            <path d={line} className="nl-chart__line" />
            {cur ? <line x1={x(cur[0])} x2={x(cur[0])} y1={m.top} y2={y(0)} className="nl-chart__cross" /> : null}
            {chart.notes.map((n, k) => {
              const p = chart.points.find(([d]) => d === n.day);
              if (!p) return null;
              const cx = x(p[0]);
              const cy = y(p[1]);
              // Narrow: a numbered marker, keyed below the chart (direct labels would collide).
              if (narrow) {
                const above = p[1] < 70;
                return (
                  <g key={n.day}>
                    <circle cx={cx} cy={cy} r="5" className="nl-chart__dot" />
                    <circle cx={Math.min(Math.max(cx, m.left + 9), width - 9)} cy={cy + (above ? -20 : 20)} r="9" className="nl-chart__marker" />
                    <text x={Math.min(Math.max(cx, m.left + 9), width - 9)} y={cy + (above ? -20 : 20)} dy="0.35em" textAnchor="middle" className="nl-chart__marker-no">
                      {k + 1}
                    </text>
                  </g>
                );
              }
              const lay = NOTE_LAYOUT[n.day] || { anchor: 'middle', dx: 0, dy: -18 };
              const lines = splitNote(n.text);
              return (
                <g key={n.day}>
                  <circle cx={cx} cy={cy} r="5" className="nl-chart__dot" />
                  <text x={cx + lay.dx} y={cy + lay.dy} textAnchor={lay.anchor} className="nl-chart__note">
                    {lines.map((t, i) => (
                      <tspan key={t} x={cx + lay.dx} dy={i ? '1.25em' : 0}>
                        {t}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
            {cur ? <circle cx={x(cur[0])} cy={y(cur[1])} r="5.5" className="nl-chart__dot is-active" /> : null}
          </svg>
        ) : null}
        {tip ? (
          <div className="nl-chart__tip" style={{ left: tip.left, top: tip.top }} role="status">
            <strong className="u-tabular">{tip.value}</strong>
            <span>{tip.days}</span>
            {tip.note ? <em>{tip.note}</em> : null}
          </div>
        ) : null}
      </div>
      {narrow ? (
        <ol className="nl-chart__key">
          {chart.notes.map((n, k) => (
            <li key={n.day}>
              <span className="nl-chart__key-no" aria-hidden="true">
                {k + 1}
              </span>
              <span>
                {n.day === 0 ? 'Exam day' : `${n.day} days to go`}: {n.text}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="nl-chart__caption">{chart.caption}</p>
      <details className="nl-chart__data">
        <summary>Show the data</summary>
        <table className="nl-chart__table">
          <caption className="visually-hidden">{chart.title}</caption>
          <thead>
            <tr>
              <th scope="col">{chart.xLabel}</th>
              <th scope="col">{chart.yLabel}</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {chart.points.map(([d, v]) => (
              <tr key={d}>
                <td className="u-tabular">{d}</td>
                <td className="u-tabular">{v}%</td>
                <td>{notes.get(d) || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
