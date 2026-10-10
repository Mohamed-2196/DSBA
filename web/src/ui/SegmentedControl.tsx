import { useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cx, renderIcon, type IconSource } from './internal';
import './SegmentedControl.css';

export interface SegmentOption<V extends string | number> {
  value: V;
  label: ReactNode;
  icon?: IconSource | null;
  /** accessible name when the label is not enough (or with iconOnly) */
  ariaLabel?: string;
  /** thumb fill for this option when selected (YearSwitcher uses cohorts) */
  color?: string;
  /** text colour on that fill */
  onColor?: string;
}

export interface SegmentedControlProps<V extends string | number> extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: SegmentOption<V>[];
  /** the selected value; nothing is selected when it matches no option */
  value: V | null | undefined;
  onChange?: (value: V) => void;
  /** accessible group name (required) */
  label: string;
  size?: 'sm' | 'md';
  /** hide labels (they become aria-labels) */
  iconOnly?: boolean;
  fullWidth?: boolean;
}

/**
 * Single-choice segmented control (radio group) with a sliding thumb.
 * Use for view toggles (Table / Grid), small mode switches.
 */
export function SegmentedControl<V extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  iconOnly = false,
  fullWidth = false,
  className,
  ...rest
}: SegmentedControlProps<V>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const index = options.findIndex((o) => o.value === value); // -1 = nothing selected

  useLayoutEffect(() => {
    const list = listRef.current;
    const el = index >= 0 ? list?.querySelectorAll<HTMLElement>('[role="radio"]')[index] : null;
    if (!list || !el) {
      setThumb(null);
      return undefined;
    }
    const measure = () => setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [index, options.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = (Math.max(index, 0) + keys[e.key] + options.length) % options.length;
    onChange?.(options[next].value);
    listRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  const sel = index >= 0 ? options[index] : null;
  return (
    <div ref={listRef} role="radiogroup" aria-label={label} className={cx('ui-seg', `ui-seg--${size}`, fullWidth && 'ui-seg--full', className)} onKeyDown={onKeyDown} {...rest}>
      {thumb ? (
        <span
          className={cx('ui-seg__thumb', !!sel?.color && 'has-color')}
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
