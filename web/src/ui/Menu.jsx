import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { cx, mergeRefs, renderIcon, useFloating, useLayer } from './internal';
import './Menu.css';

/**
 * Dropdown menu or popover anchored to a trigger element.
 * @param {element} trigger  a single element (Button / IconButton …); gets onClick, aria-expanded, ref
 * @param {Array} items  [{ id, label, icon?, onSelect?, to?, href?, danger?, disabled?, hint? } | { divider: true } | { heading: 'Text' }]
 * @param {(api:{close:()=>void}) => node} children  custom popover content instead of items (role=dialog)
 * @param {'start'|'end'} align   horizontal alignment to the trigger (default 'start')
 * @param {'bottom'|'top'|'right'|'left'} side  (default 'bottom')
 * @param {number|string} width   panel width (default min 220px)
 * @param {string} label  accessible name for the panel
 */
export function Menu({ trigger, items, children, align = 'start', side = 'bottom', width, label, className, onOpenChange }) {
  const [open, setOpenState] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  const pos = useFloating(open, triggerRef, panelRef, { placement: `${side}-${align}`, offset: 8 });
  const isMenu = !children && Array.isArray(items);

  const setOpen = useCallback(
    (v) => {
      setOpenState(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const close = useCallback(
    (restore = true) => {
      setOpen(false);
      if (restore) triggerRef.current?.focus({ preventScroll: true });
    },
    [setOpen],
  );

  useLayer(open, () => close(true));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, setOpen]);

  // Move focus into the panel once it is positioned.
  useEffect(() => {
    if (!open || !pos) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    const first = panel.querySelector('[role="menuitem"]:not([aria-disabled="true"]), [data-autofocus], button, a[href], input');
    (first || panel).focus({ preventScroll: true });
  }, [open, pos]);

  const onPanelKeyDown = (e) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!isMenu) return;
    const els = [...panelRef.current.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')];
    const i = els.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = els[(i + 1) % els.length];
    else if (e.key === 'ArrowUp') next = els[(i - 1 + els.length) % els.length];
    else if (e.key === 'Home') next = els[0];
    else if (e.key === 'End') next = els[els.length - 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const triggerEl = cloneElement(trigger, {
    ref: mergeRefs(trigger.ref, triggerRef),
    'aria-haspopup': isMenu ? 'menu' : 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? `menu${uid}` : undefined,
    onClick: (e) => {
      trigger.props.onClick?.(e);
      setOpen(!open);
    },
    onKeyDown: (e) => {
      trigger.props.onKeyDown?.(e);
      if (isMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
        e.preventDefault();
        setOpen(true);
      }
    },
  });

  const renderItem = (item, i) => {
    if (item.divider) return <div key={`d${i}`} role="separator" className="ui-menu__sep" />;
    if (item.heading) return <div key={`h${i}`} className="ui-menu__heading" role="presentation">{item.heading}</div>;
    const content = (
      <>
        {renderIcon(item.icon, { className: 'ui-menu__icon' })}
        <span className="ui-menu__label">{item.label}</span>
        {item.hint ? <span className="ui-menu__hint">{item.hint}</span> : null}
      </>
    );
    const common = {
      key: item.id || i,
      role: 'menuitem',
      tabIndex: -1,
      className: cx('ui-menu__item', item.danger && 'is-danger'),
      'aria-disabled': item.disabled || undefined,
      onClick: (e) => {
        if (item.disabled) {
          e.preventDefault();
          return;
        }
        item.onSelect?.(e);
        close(!item.to && !item.href);
      },
    };
    if (item.to) return <Link {...common} to={item.to}>{content}</Link>;
    if (item.href) return <a {...common} href={item.href} target="_blank" rel="noopener noreferrer">{content}</a>;
    return <button {...common} type="button">{content}</button>;
  };

  return (
    <>
      {triggerEl}
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={`menu${uid}`}
              role={isMenu ? 'menu' : 'dialog'}
              aria-label={label}
              tabIndex={-1}
              className={cx('ui-menu', !isMenu && 'ui-menu--popover', className)}
              data-side={pos?.side || side}
              style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden', width }}
              onKeyDown={onPanelKeyDown}
            >
              {isMenu ? items.map(renderItem) : children({ close })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
