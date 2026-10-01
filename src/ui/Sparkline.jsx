import { cx } from './internal.js';
import './Sparkline.css';

/**
 * Tiny line chart in the pulse style.
 * @param {number[]} data
 * @param {number} width / height  px (default 120 × 32)
 * @param {string} color  CSS colour (default var(--cobalt))
 * @param {boolean} area  flat 10% fill under the line
 * @param {boolean} dot   end dot (default true)
 * @param {string} label  accessible description, e.g. "Replies per day, last 14 days"
 */
export function Sparkline({ data = [], width = 120, height = 32, color = 'var(--cobalt)', area = false, dot = true, strokeWidth = 2, label, className }) {
  const pad = strokeWidth + 2;
  const pts = data.length ? data : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const xy = pts.map((d, i) => [
    pad + (i * (width - pad * 2)) / Math.max(1, pts.length - 1),
    height - pad - ((d - min) / span) * (height - pad * 2),
  ]);
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
