// Small, quiet SVG charts drawn inside mock pages (textbook style: thin axes, one accent).
import { gauss, rngFor } from '../data/random.js';
import { phi, seededSeries } from './plan.js';

const PAD = { l: 38, r: 14, t: 12, b: 28 };

function scales(width, height, [x0, x1], [y0, y1]) {
  const iw = width - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  return {
    x: (v) => PAD.l + ((v - x0) / (x1 - x0)) * iw,
    y: (v) => PAD.t + ih - ((v - y0) / (y1 - y0)) * ih,
    iw,
    ih,
  };
}

const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

function Axes({ s, width, height, xTicks = [], yTicks = [], xLabel, yLabel, fmtX = String, fmtY = String, grid = true }) {
  const bottom = height - PAD.b;
  return (
    <g className="lib-chart__axes">
      {grid ? yTicks.map((t) => <line key={`g${t}`} className="lib-chart__grid" x1={PAD.l} x2={width - PAD.r} y1={s.y(t)} y2={s.y(t)} />) : null}
      <line className="lib-chart__axis" x1={PAD.l} x2={width - PAD.r} y1={bottom} y2={bottom} />
      <line className="lib-chart__axis" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={bottom} />
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line className="lib-chart__axis" x1={s.x(t)} x2={s.x(t)} y1={bottom} y2={bottom + 4} />
          <text x={s.x(t)} y={bottom + 16} textAnchor="middle">{fmtX(t)}</text>
        </g>
      ))}
      {yTicks.map((t) => (
        <text key={`y${t}`} x={PAD.l - 7} y={s.y(t) + 3.5} textAnchor="end">{fmtY(t)}</text>
      ))}
      {xLabel ? <text className="lib-chart__label" x={width - PAD.r} y={bottom - 6} textAnchor="end">{xLabel}</text> : null}
      {yLabel ? <text className="lib-chart__label" x={PAD.l + 6} y={PAD.t + 10}>{yLabel}</text> : null}
    </g>
  );
}

function Density({ width, height }) {
  const s = scales(width, height, [-3.5, 3.5], [0, 0.43]);
  const pdf = (x) => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  const pts = [];
  for (let x = -3.5; x <= 3.5001; x += 0.05) pts.push([s.x(x), s.y(pdf(x))]);
  const tail = [[s.x(1.645), s.y(0)]];
  for (let x = 1.645; x <= 3.5001; x += 0.05) tail.push([s.x(x), s.y(pdf(x))]);
  tail.push([s.x(3.5), s.y(0)]);
  return (
    <>
      <Axes s={s} width={width} height={height} xTicks={[-3, -2, -1, 0, 1, 2, 3]} yTicks={[0, 0.1, 0.2, 0.3, 0.4]} fmtY={(v) => v.toFixed(1)} xLabel="z" />
      <path className="lib-chart__area" d={`${path(tail)} Z`} />
      <line className="lib-chart__ref" x1={s.x(1.645)} x2={s.x(1.645)} y1={s.y(0)} y2={s.y(pdf(1.645)) - 18} />
      <text className="lib-chart__note" x={s.x(1.645) + 6} y={s.y(pdf(1.645)) - 10}>5%</text>
      <path className="lib-chart__line" d={path(pts)} />
    </>
  );
}

function Exponential({ width, height }) {
  const s = scales(width, height, [0, 5], [0, 1.05]);
  const pts = [];
  for (let x = 0; x <= 5.0001; x += 0.05) pts.push([s.x(x), s.y(Math.exp(-x))]);
  const area = [[s.x(0), s.y(0)]];
  for (let x = 0; x <= 1.0001; x += 0.05) area.push([s.x(x), s.y(Math.exp(-x))]);
  area.push([s.x(1), s.y(0)]);
  return (
    <>
      <Axes s={s} width={width} height={height} xTicks={[0, 1, 2, 3, 4, 5]} yTicks={[0, 0.5, 1]} fmtY={(v) => v.toFixed(1)} xLabel="x" yLabel="f(x)" />
      <path className="lib-chart__area" d={`${path(area)} Z`} />
      <path className="lib-chart__line" d={path(pts)} />
    </>
  );
}

function Bars({ width, height, seed }) {
  const rng = rngFor('bars', seed);
  const bins = 14;
  const edges = Array.from({ length: bins + 1 }, (_, i) => -3.5 + (7 * i) / bins);
  const counts = edges.slice(0, -1).map((e, i) => Math.max(1, Math.round(500 * (phi(edges[i + 1]) - phi(e)) * (0.85 + rng() * 0.3))));
  const max = Math.max(...counts);
  const top = Math.ceil(max / 20) * 20;
  const s = scales(width, height, [0, bins], [0, top]);
  const bw = s.iw / bins;
  return (
    <>
      <Axes s={s} width={width} height={height} yTicks={[0, top / 2, top]} />
      {counts.map((c, i) => (
        <rect key={i} className="lib-chart__bar" x={s.x(i) + 1} y={s.y(c)} width={bw - 2} height={s.y(0) - s.y(c)} />
      ))}
    </>
  );
}

function Scatter({ width, height, seed }) {
  const rng = rngFor('scatter', seed);
  const pts = Array.from({ length: 42 }, () => {
    const x = rng() * 10;
    return [x, 2 + 0.8 * x + gauss(rng) * 1.1];
  });
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  const a = my - b * mx;
  const s = scales(width, height, [0, 10], [0, 12]);
  return (
    <>
      <Axes s={s} width={width} height={height} xTicks={[0, 2, 4, 6, 8, 10]} yTicks={[0, 4, 8, 12]} xLabel="x" yLabel="y" />
      {pts.map(([x, y], i) => (
        <circle key={i} className="lib-chart__dot" cx={s.x(x)} cy={s.y(Math.max(0.2, Math.min(11.8, y)))} r="2.6" />
      ))}
      <path className="lib-chart__fit" d={path([[s.x(0), s.y(a)], [s.x(10), s.y(a + 10 * b)]])} />
    </>
  );
}

function Series({ width, height, seed }) {
  const data = seededSeries(seed, 36, { start: 40, drift: 0.55, noise: 2.2 });
  const smooth = data.map((_, i) => (i < 2 ? null : (data[i] + data[i - 1] + data[i - 2]) / 3));
  const lo = Math.floor(Math.min(...data) / 10) * 10;
  const hi = Math.ceil(Math.max(...data) / 10) * 10;
  const s = scales(width, height, [0, 35], [lo, hi]);
  return (
    <>
      <Axes s={s} width={width} height={height} xTicks={[0, 12, 24, 35]} fmtX={(t) => (t === 35 ? '36' : String(t))} yTicks={[lo, (lo + hi) / 2, hi]} xLabel="month" />
      <path className="lib-chart__line lib-chart__line--ink" d={path(data.map((v, i) => [s.x(i), s.y(v)]))} />
      <path className="lib-chart__fit" d={path(smooth.map((v, i) => [i, v]).filter(([, v]) => v != null).map(([i, v]) => [s.x(i), s.y(v)]))} />
    </>
  );
}

function SupplyDemand({ width, height }) {
  const s = scales(width, height, [0, 110], [0, 64]);
  const D = [[0, 60], [110, 5]];
  const S = [[20, 0], [110, 30]];
  const eq = [80, 20];
  return (
    <>
      <Axes s={s} width={width} height={height} grid={false} xTicks={[80]} yTicks={[20]} fmtX={() => 'Q* = 80'} fmtY={() => 'P* = 20'} xLabel="quantity" yLabel="price" />
      <line className="lib-chart__ref" x1={s.x(0)} x2={s.x(eq[0])} y1={s.y(eq[1])} y2={s.y(eq[1])} />
      <line className="lib-chart__ref" x1={s.x(eq[0])} x2={s.x(eq[0])} y1={s.y(0)} y2={s.y(eq[1])} />
      <path className="lib-chart__line lib-chart__line--ink" d={path(D.map(([q, p]) => [s.x(q), s.y(p)]))} />
      <path className="lib-chart__line" d={path(S.map(([q, p]) => [s.x(q), s.y(p)]))} />
      <circle className="lib-chart__eq" cx={s.x(eq[0])} cy={s.y(eq[1])} r="4" />
      <text className="lib-chart__note" x={s.x(104)} y={s.y(9)}>D</text>
      <text className="lib-chart__note lib-chart__note--accent" x={s.x(104)} y={s.y(31)}>S</text>
    </>
  );
}

function FunctionPlot({ width, height }) {
  const f = (x) => x ** 3 - 6 * x ** 2 + 9 * x + 1;
  const s = scales(width, height, [-0.4, 4.4], [-4, 10]);
  const pts = [];
  for (let x = -0.4; x <= 4.4001; x += 0.04) pts.push([s.x(x), s.y(f(x))]);
  return (
    <>
      <Axes s={s} width={width} height={height} xTicks={[0, 1, 2, 3, 4]} yTicks={[0, 5, 10]} xLabel="x" yLabel="f(x)" />
      <line className="lib-chart__ref" x1={s.x(0.4)} x2={s.x(1.6)} y1={s.y(5)} y2={s.y(5)} />
      <line className="lib-chart__ref" x1={s.x(2.4)} x2={s.x(3.6)} y1={s.y(1)} y2={s.y(1)} />
      <path className="lib-chart__line" d={path(pts)} />
      <circle className="lib-chart__eq" cx={s.x(1)} cy={s.y(5)} r="4" />
      <circle className="lib-chart__eq" cx={s.x(3)} cy={s.y(1)} r="4" />
      <text className="lib-chart__note" x={s.x(1) + 8} y={s.y(5) - 8}>max (1, 5)</text>
      <text className="lib-chart__note" x={s.x(3) + 8} y={s.y(1) + 16}>min (3, 1)</text>
    </>
  );
}

function Roc({ width, height }) {
  const s = scales(width, height, [0, 1], [0, 1]);
  const pts = [];
  // 51 exact steps: accumulating 0.02 overshoots 1 by a hair, and a negative base ** 3.6 is NaN.
  for (let i = 0; i <= 50; i += 1) {
    const x = i / 50;
    pts.push([s.x(x), s.y(1 - (1 - x) ** 3.6)]);
  }
  return (
    <>
      <Axes s={s} width={width} height={height} xTicks={[0, 0.5, 1]} yTicks={[0, 0.5, 1]} fmtX={(v) => v.toFixed(1)} fmtY={(v) => v.toFixed(1)} xLabel="false positive rate" yLabel="true positive rate" />
      <path className="lib-chart__area" d={`${path(pts)} L${s.x(1)} ${s.y(0)} L${s.x(0)} ${s.y(0)} Z`} />
      <line className="lib-chart__ref" x1={s.x(0)} y1={s.y(0)} x2={s.x(1)} y2={s.y(1)} />
      <path className="lib-chart__line" d={path(pts)} />
      <text className="lib-chart__note" x={s.x(0.55)} y={s.y(0.3)}>AUC = 0.91</text>
    </>
  );
}

const CHARTS = { density: Density, exp: Exponential, bars: Bars, scatter: Scatter, series: Series, 'supply-demand': SupplyDemand, function: FunctionPlot, roc: Roc };

/** A small chart for a mock page. kind: density | exp | bars | scatter | series | supply-demand | function | roc. */
export function MiniChart({ kind, seed = 'chart', width = 440, height = 220, className = 'lib-chart' }) {
  const Chart = CHARTS[kind] || Series;
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <Chart width={width} height={height} seed={seed} />
    </svg>
  );
}
