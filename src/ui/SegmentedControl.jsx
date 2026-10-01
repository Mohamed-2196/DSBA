import { useLayoutEffect, useRef, useState } from 'react';
import { cx, renderIcon } from './internal.js';
import './SegmentedControl.css';

/**
 * Single-choice segmented control (radio group) with a sliding thumb.
 * Use for view toggles (Table / Grid), small mode switches.
 * @param {{ value: string|number, label: node, icon?, ariaLabel?, color?: string, onColor?: string }[]} options
 *        color/onColor: optional thumb fill + text colour for the selected option (YearSwitcher uses cohorts)
 * @param value, onChange(value)
 * @param {string} label  accessible group name (required)
 * @param {'sm'|'md'} size
 * @param {boolean} iconOnly  hide labels (they become aria-labels)
 */
export function SegmentedControl({ options, value, onChange, label, size = 'md', iconOnly = false, fullWidth = false, className, ...rest }) {
  const listRef = useRef(null);
  const [thumb, setThumb] = useState(null);
  const index = options.findIndex((o) => o.value === value); // -1 = nothing selected

  useLayoutEffect(() => {
    const el = index >= 0 ? listRef.current?.querySelectorAll('[role="radio"]')[index] : null;
    if (!el) {
      setThumb(null);
      return undefined;
    }
    const measure = () => setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [index, options.length]);

  const onKeyDown = (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = (Math.max(index, 0) + keys[e.key] + options.length) % options.length;
    onChange?.(options[next].value);
    listRef.current?.querySelectorAll('[role="radio"]')[next]?.focus();
  };

  const sel = index >= 0 ? options[index] : null;
  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={label}
      className={cx('ui-seg', `ui-seg--${size}`, fullWidth && 'ui-seg--full', className)}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {thumb ? (
        <span
          className={cx('ui-seg__thumb', sel?.color && 'has-color')}
          aria-hidden="true"
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)`, background: sel?.color }}
        />
      ) : null}
      {options.map((o, i) => {
        const checked = i === index;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={iconOnly ? o.ariaLabel || String(o.label) : o.ariaLabel}
            tabIndex={checked || (index < 0 && i === 0) ? 0 : -1}
            className={cx('ui-seg__item', checked && 'is-checked')}
            style={checked && o.onColor ? { color: o.onColor } : undefined}
            onClick={() => onChange?.(o.value)}
          >
            {renderIcon(o.icon, { className: 'ui-seg__icon' })}
            {!iconOnly ? <span>{o.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
