import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx, renderIcon, type IconSource } from './internal';
import './Chip.css';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'color'> {
  selected?: boolean;
  /** called with the next selected state */
  onChange?: (next: boolean) => void;
  /** leading Phosphor icon */
  icon?: IconSource | null;
  /** optional count shown after the label */
  count?: number | null;
  /** optional CSS colour for a leading dot (e.g. cohortColor(2)) */
  color?: string;
  size?: 'sm' | 'md';
  children?: ReactNode;
}

/** Toggleable filter chip (aria-pressed). Controlled: pass `selected` + `onClick`/`onChange`. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, onChange, onClick, icon, count, color, size = 'md', className, children, ...rest },
  ref,
) {
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
