import { cx } from './internal';
import './Sparkline.css';

export interface SparklineProps {
  data?: number[];
  /** px (default 120) */
  width?: number;
  /** px (default 32) */
  height?: number;
  /** CSS colour (default var(--cobalt)) */
  color?: string;
  /** flat 10% fill under the line */
  area?: boolean;
  /** end dot (default true) */
  dot?: boolean;
  strokeWidth?: number;
  /** accessible description, e.g. "Replies per day, last 14 days" */
  label?: string;
  className?: string;
}

/** Tiny line chart in the trace style. */
export function Sparkline({ data = [], width = 120, height = 32, color = 'var(--cobalt)', area = false, dot = true, strokeWidth = 2, label, className }: SparklineProps) {
  const pad = strokeWidth + 2;
  const pts = data.length ? data : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const xy = pts.map((d, i) => [pad + (i * (width - pad * 2)) / Math.max(1, pts.length - 1), height - pad - ((d - min) / span) * (height - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1];
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg className={cx('ui-sparkline', className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ color }} {...a11y}>
      {area ? <path d={`${line} L${last[0].toFixed(1)} ${height} L${xy[0][0].toFixed(1)} ${height} Z`} fill="currentColor" fillOpacity=".1" /> : null}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {dot ? <circle cx={last[0]} cy={last[1]} r={strokeWidth + 0.75} fill="currentColor" /> : null}
    </svg>
  );
}
