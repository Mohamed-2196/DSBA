import { forwardRef } from 'react';
import { cx, renderIcon } from './internal.js';
import './Chip.css';

/**
 * Toggleable filter chip (aria-pressed). Controlled: pass `selected` + `onClick`/`onChange`.
 * @param {boolean} selected
 * @param {(next:boolean)=>void} onChange  called with the next selected state
 * @param icon   leading Phosphor icon
 * @param {number} count  optional count shown after the label
 * @param {string} color  optional CSS colour for a leading dot (e.g. cohortColor(2))
 */
export const Chip = forwardRef(function Chip({ selected = false, onChange, onClick, icon, count, color, size = 'md', className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cx('ui-chip', `ui-chip--${size}`, selected && 'is-selected', className)}
      onClick={(e) => {
        onClick?.(e);
        onChange?.(!selected);
      }}
      {...rest}
    >
      {color ? <span className="ui-chip__dot" style={{ background: color }} aria-hidden="true" /> : null}
      {renderIcon(icon, { className: 'ui-chip__icon' })}
      <span>{children}</span>
      {count != null ? <span className="ui-chip__count">{count}</span> : null}
    </button>
  );
});
