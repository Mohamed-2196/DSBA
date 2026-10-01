import { cx, renderIcon } from './internal.js';
import { cohortLabel, normalizeYear, COHORTS } from '../state/cohort.js';
import './Badge.css';

/**
 * Small status label (pill).
 * @param {'neutral'|'cobalt'|'signal'|'alert'|'highlight'|'navy'|'outline'} tone
 *        'highlight' = rough highlighter tag (use for "New").
 * @param {'sm'|'md'} size
 * @param icon  Phosphor component or element (leading)
 */
export function Badge({ tone = 'neutral', size = 'md', icon, className, children, ...rest }) {
  return (
    <span className={cx('ui-badge', `ui-badge--${tone}`, `ui-badge--${size}`, className)} {...rest}>
      {renderIcon(icon, { className: 'ui-badge__icon' })}
      {children}
    </span>
  );
}

/**
 * Cohort label in the cohort colour.
 * @param {1|2|3} year
 * @param {'soft'|'solid'|'dot'} variant  soft tint (default) · solid fill · just a dot + text
 * @param {boolean} short  'Y2' instead of 'Year 2'
 */
export function CohortBadge({ year, variant = 'soft', size = 'md', short = false, className, ...rest }) {
  const y = normalizeYear(year);
  const label = y ? (short ? COHORTS[y].short : COHORTS[y].label) : cohortLabel(null);
  return (
    <span className={cx('ui-cohort', `ui-cohort--${variant}`, `ui-badge--${size}`, y ? `ui-cohort--y${y}` : 'ui-cohort--all', className)} {...rest}>
      {variant !== 'solid' ? <span className="ui-cohort__dot" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
