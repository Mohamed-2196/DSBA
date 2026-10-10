import { cx } from './internal';
import './ProgressRing.css';

/**
 * Circular progress.
 * @param {number} value  0–100
 * @param {number} size   px (default 40)
 * @param {number} stroke px (default 4)
 * @param {string} color  CSS colour (default var(--cobalt)); e.g. cohortColor(year) or 'var(--signal)'
 * @param {boolean} showValue  print the % in the middle (default true when size ≥ 36)
 * @param {string} label  accessible label (default 'Progress')
 */
export function ProgressRing({ value = 0, size = 40, stroke = 4, color = 'var(--cobalt)', showValue, label = 'Progress', className, children }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const show = showValue ?? size >= 36;
  return (
    <span
      className={cx('ui-ring', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ui-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ui-ring__bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children ?? (show ? <span className="ui-ring__value" style={{ fontSize: Math.max(10, size * 0.27) }}>{Math.round(v)}<small>%</small></span> : null)}
    </span>
  );
}
