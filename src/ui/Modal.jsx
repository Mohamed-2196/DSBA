import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { cx, useOverlay, usePresence } from './internal.js';
import { IconButton } from './IconButton.jsx';
import './Modal.css';

/**
 * Dialog with focus trap, Esc to close, scroll lock, focus restore, scrim click to close.
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {node} title        required for accessibility (visually hide with hideHeader)
 * @param {node} description  optional line under the title
 * @param {node} footer       actions row (right-aligned)
 * @param {'sm'|'md'|'lg'|'xl'} size  420 / 560 / 760 / 980px
 * @param initialFocusRef     element to focus on open (else [data-autofocus] or first focusable)
 */
export function Modal({ open, onClose, title, description, footer, size = 'md', initialFocusRef, hideHeader = false, className, bodyClassName, children, ...rest }) {
  const { mounted, state } = usePresence(open, 200);
  const panelRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  useOverlay({ open, onClose, panelRef, initialFocusRef });
  if (!mounted) return null;
  return createPortal(
    <div className="ui-modal" data-state={state}>
      <div className="ui-modal__scrim" onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`m${uid}-t`}
        aria-describedby={description ? `m${uid}-d` : undefined}
        tabIndex={-1}
        className={cx('ui-modal__panel', `ui-modal__panel--${size}`, className)}
        {...rest}
      >
        <header className={cx('ui-modal__header', hideHeader && 'visually-hidden')}>
          <div className="ui-modal__heading">
            <h2 id={`m${uid}-t`} className="ui-modal__title">{title}</h2>
            {description ? <p id={`m${uid}-d`} className="ui-modal__desc">{description}</p> : null}
          </div>
          <IconButton label="Close" icon={X} size="sm" onClick={onClose} className="ui-modal__close" />
        </header>
        <div className={cx('ui-modal__body', bodyClassName)}>{children}</div>
        {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Side or bottom sheet with the same behaviour as Modal.
 * @param {'right'|'left'|'bottom'} side  default 'right'
 * @param {number|string} width  for left/right (default 420)
 */
export function Drawer({ open, onClose, title, description, footer, side = 'right', width = 420, initialFocusRef, className, bodyClassName, children, ...rest }) {
  const { mounted, state } = usePresence(open, 220);
  const panelRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  useOverlay({ open, onClose, panelRef, initialFocusRef });
  if (!mounted) return null;
  return createPortal(
    <div className={cx('ui-drawer', `ui-drawer--${side}`)} data-state={state}>
      <div className="ui-modal__scrim" onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`d${uid}-t`}
        aria-describedby={description ? `d${uid}-d` : undefined}
        tabIndex={-1}
        className={cx('ui-drawer__panel', className)}
        style={side !== 'bottom' ? { width } : undefined}
        {...rest}
      >
        {side === 'bottom' ? <span className="ui-drawer__grabber" aria-hidden="true" /> : null}
        <header className="ui-modal__header">
          <div className="ui-modal__heading">
            <h2 id={`d${uid}-t`} className="ui-modal__title">{title}</h2>
            {description ? <p id={`d${uid}-d`} className="ui-modal__desc">{description}</p> : null}
          </div>
          <IconButton label="Close" icon={X} size="sm" onClick={onClose} className="ui-modal__close" />
        </header>
        <div className={cx('ui-drawer__body', bodyClassName)}>{children}</div>
        {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
