import { cx } from './internal.js';
import './Skeleton.css';

/**
 * Loading placeholder.
 * @param width / height  CSS lengths (default 100% × 1em)
 * @param {boolean} circle
 * @param {number} lines  render N text lines (last one shorter)
 */
export function Skeleton({ width, height, radius, circle = false, lines, className, style }) {
  if (lines) {
    return (
      <span className={cx('ui-skeleton-lines', className)} style={style} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="ui-skeleton" style={{ width: i === lines - 1 && lines > 1 ? '62%' : '100%', height: height || '0.9em' }} />
        ))}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx('ui-skeleton', className)}
      style={{ width: width ?? '100%', height: height ?? '1em', borderRadius: circle ? '999px' : radius, ...style }}
    />
  );
}
