import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx, useFloating } from './internal.js';
import './Tooltip.css';

/**
 * Hover/focus tooltip (portal, so it escapes overflow containers).
 * @param {string} label   text
 * @param {'top'|'right'|'bottom'|'left'} side
 * @param {boolean} describe  set aria-describedby on the child (default true; IconButton turns it off
 *                            because its aria-label already says the same thing)
 */
export function Tooltip({ label, side = 'top', delay = 350, describe = true, disabled = false, children, className }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const tipRef = useRef(null);
  const timer = useRef(null);
  const id = useId();
  const pos = useFloating(open, anchorRef, tipRef, { placement: side, offset: 8 });

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (disabled || !label) return children;

  const show = (now) => {
    clearTimeout(timer.current);
    if (now) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  const child = describe && isValidElement(children) ? cloneElement(children, { 'aria-describedby': open ? id : undefined }) : children;

  return (
    <span
      ref={anchorRef}
      className={cx('ui-tooltip-anchor', className)}
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocus={(e) => { if (e.target.matches(':focus-visible')) show(true); }}
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
