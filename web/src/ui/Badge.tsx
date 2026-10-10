import type { HTMLAttributes, ReactNode } from 'react';
import { cx, renderIcon, type IconSource } from './internal';
import { cohortLabel, normalizeYear, COHORTS } from '../state/cohort';
import './Badge.css';

export type BadgeTone = 'neutral' | 'cobalt' | 'signal' | 'alert' | 'highlight' | 'navy' | 'outline';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 'highlight' = rough highlighter tag (use for "New"). Default 'neutral'. */
  tone?: BadgeTone;
  size?: BadgeSize;
  /** leading icon: Phosphor component or element */
  icon?: IconSource | null;
  children?: ReactNode;
}

/** Small status label (pill). */
export function Badge({ tone = 'neutral', size = 'md', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx('ui-badge', `ui-badge--${tone}`, `ui-badge--${size}`, className)} {...rest}>
      {renderIcon(icon, { className: 'ui-badge__icon' })}
      {children}
    </span>
  );
}

export interface CohortBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 1|2|3; anything else (null) reads 'All years' */
  year: number | string | null | undefined;
  /** soft tint (default) · solid fill · just a dot + text */
  variant?: 'soft' | 'solid' | 'dot';
  size?: BadgeSize;
  /** 'Y2' instead of 'Year 2' */
  short?: boolean;
}

/** Cohort label in the cohort colour. */
export function CohortBadge({ year, variant = 'soft', size = 'md', short = false, className, ...rest }: CohortBadgeProps) {
  const y = normalizeYear(year);
  const label = y ? (short ? COHORTS[y].short : COHORTS[y].label) : cohortLabel(null);
  return (
    <span className={cx('ui-cohort', `ui-cohort--${variant}`, `ui-badge--${size}`, y ? `ui-cohort--y${y}` : 'ui-cohort--all', className)} {...rest}>
      {variant !== 'solid' ? <span className="ui-cohort__dot" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
