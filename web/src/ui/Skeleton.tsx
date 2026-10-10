import type { CSSProperties } from 'react';
import { cx } from './internal';
import './Skeleton.css';

export interface SkeletonProps {
  /** CSS length (default 100%) */
  width?: CSSProperties['width'];
  /** CSS length (default 1em; 0.9em per line with `lines`) */
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  circle?: boolean;
  /** render N text lines (last one shorter) */
  lines?: number;
  className?: string;
  style?: CSSProperties;
}

/** Loading placeholder. */
export function Skeleton({ width, height, radius, circle = false, lines, className, style }: SkeletonProps) {
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
