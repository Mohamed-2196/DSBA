import { Fragment, type HTMLAttributes, type ReactNode } from 'react';
import { cx, renderIcon, type IconSource } from './internal';
import { formatCount } from './utils';
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

/**
 * A count: tabular digits, so a count that changes doesn't nudge what's beside it, and thousands separated ('1,234').
 * The separator has its normal width: this typeface's tabular comma is as wide as a digit and reads as '1 , 234'.
 */
export function Count({ value }: { value: number }) {
  const [first, ...rest] = formatCount(value).split(',');
  return (
    <span className="ui-count">
      {first}
      {rest.map((group, i) => (
        <Fragment key={i}>
          <span className="ui-count__sep">,</span>
          {group}
        </Fragment>
      ))}
    </span>
  );
}

/** Small status label (pill). A number is shown as a count (Count); words keep the typeface's usual figures. */
export function Badge({ tone = 'neutral', size = 'md', icon, className, children, ...rest }: BadgeProps) {
  const label = typeof children === 'number' ? <Count value={children} /> : children;
  return (
    <span className={cx('ui-badge', `ui-badge--${tone}`, `ui-badge--${size}`, className)} {...rest}>
      {renderIcon(icon, { className: 'ui-badge__icon' })}
      {/* One box for the words: written in pieces ('Exam {date}, {when}'), each piece would otherwise be a flex item
          of its own, and the gap would open before the comma. */}
      {label != null && label !== false && label !== '' ? <span className="ui-badge__label">{label}</span> : null}
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
  /** words in place of the year's name, in its colour (a forum category's short name) */
  label?: string;
}

/** Cohort label in the cohort colour. */
export function CohortBadge({
  year,
  variant = 'soft',
  size = 'md',
  short = false,
  label: words,
  className,
  ...rest
}: CohortBadgeProps) {
  const y = normalizeYear(year);
  const label = words ?? (y ? (short ? COHORTS[y].short : COHORTS[y].label) : cohortLabel(null));
  return (
    <span
      className={cx(
        'ui-cohort',
        `ui-cohort--${variant}`,
        `ui-badge--${size}`,
        y ? `ui-cohort--y${y}` : 'ui-cohort--all',
        className,
      )}
      {...rest}
    >
      {variant !== 'solid' ? <span className="ui-cohort__dot" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
