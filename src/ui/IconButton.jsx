import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { cx, renderIcon } from './internal.js';
import { Tooltip } from './Tooltip.jsx';
import './IconButton.css';

/**
 * Square icon-only button. `label` is required (becomes aria-label).
 * @param {'ghost'|'secondary'|'primary'} variant  default 'ghost'
 * @param {'sm'|'md'|'lg'} size  32 / 40 / 48px
 * @param {boolean|number} badge  true → dot, number → count bubble
 * @param {boolean} tooltip  show `label` as a tooltip on hover/focus
 * @param {boolean} active   pressed/selected look (also sets aria-pressed when `toggle`)
 */
export const IconButton = forwardRef(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', badge, tooltip = false, tooltipSide = 'bottom', active = false, toggle = false, to, href, className, type, ...rest },
  ref,
) {
  if (!label && import.meta.env.DEV) console.warn('IconButton requires a `label`');
  const Comp = to ? Link : href ? 'a' : 'button';
  const props = {
    ref,
    'aria-label': label,
    className: cx('ui-iconbutton', `ui-iconbutton--${variant}`, `ui-iconbutton--${size}`, active && 'is-active', className),
    ...rest,
  };
  if (Comp === 'button') props.type = type || 'button';
  if (toggle) props['aria-pressed'] = active;
  if (to) props.to = to;
  if (href) {
    props.href = href;
    if (/^(https?:)?\/\//.test(href)) {
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
    }
  }
  const btn = (
    <Comp {...props}>
      {renderIcon(icon, { className: 'ui-iconbutton__icon' })}
      {badge ? (
        <span className={cx('ui-iconbutton__badge', typeof badge === 'number' && 'ui-iconbutton__badge--count')} aria-hidden="true">
          {typeof badge === 'number' ? (badge > 9 ? '9+' : badge) : null}
        </span>
      ) : null}
    </Comp>
  );
  return tooltip ? (
    <Tooltip label={label} side={tooltipSide} describe={false}>
      {btn}
    </Tooltip>
  ) : (
    btn
  );
});
