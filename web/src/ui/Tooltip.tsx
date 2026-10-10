import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx, useFloating } from './internal';
import './Tooltip.css';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  /** the text */
  label: ReactNode;
  side?: TooltipSide;
  /** ms before it shows on hover (default 350) */
  delay?: number;
  /**
   * set aria-describedby on the child (default true; IconButton turns it off because its aria-label already
   * says the same thing)
   */
  describe?: boolean;
  disabled?: boolean;
  children: ReactNode;
  /** class of the inline wrapper around the child */
  className?: string;
}

/** Hover/focus tooltip (portal, so it escapes overflow containers). */
export function Tooltip({ label, side = 'top', delay = 350, describe = true, disabled = false, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const pos = useFloating(open, anchorRef, tipRef, { placement: side, offset: 8 });

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (disabled || !label) return <>{children}</>;

  const show = (now: boolean) => {
    clearTimeout(timer.current);
    if (now) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  const child =
    describe && isValidElement<{ 'aria-describedby'?: string }>(children)
      ? cloneElement(children, { 'aria-describedby': open ? id : undefined })
      : children;

  return (
    <span
      ref={anchorRef}
      className={cx('ui-tooltip-anchor', className)}
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocus={(e: FocusEvent<HTMLSpanElement>) => {
        if (e.target instanceof Element && e.target.matches(':focus-visible')) show(true);
      }}
      onBlur={hide}
      onPointerDown={hide}
    >
      {child}
      {open
        ? createPortal(
            <span
              ref={tipRef}
              id={id}
              role="tooltip"
              className="ui-tooltip"
              data-side={pos?.side || side}
              style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
