import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, type To } from 'react-router-dom';
import { cx, mergeRefs, renderIcon, useFloating, useLayer, type IconSource } from './internal';
import './Menu.css';

/** A choice in a menu: runs `onSelect`, or navigates (`to`) or opens a link in a new tab (`href`). */
export interface MenuAction {
  id?: string;
  label: ReactNode;
  icon?: IconSource | null;
  onSelect?: (e: MouseEvent<HTMLElement>) => void;
  to?: To;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  /** small text on the right ('Current', a shortcut) */
  hint?: ReactNode;
  divider?: undefined;
  heading?: undefined;
}

export type MenuItem = MenuAction | { divider: true; id?: string } | { heading: ReactNode; id?: string; divider?: undefined };

/** What the trigger element receives (it must accept a ref, onClick and onKeyDown). */
interface TriggerProps {
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
}

export interface MenuApi {
  /** close the panel; focus goes back to the trigger unless restore is false */
  close: (restore?: boolean) => void;
}

export interface MenuProps {
  /** a single element (Button / IconButton …); gets onClick, aria-expanded, ref */
  trigger: ReactElement<TriggerProps>;
  items?: MenuItem[];
  /** custom popover content instead of items (role=dialog) */
  children?: (api: MenuApi) => ReactNode;
  /** horizontal alignment to the trigger (default 'start') */
  align?: 'start' | 'end';
  side?: 'bottom' | 'top' | 'right' | 'left';
  /** panel width (default min 220px) */
  width?: number | string;
  /** accessible name for the panel */
  label?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

function elementRef(el: ReactElement): Ref<HTMLElement> | undefined {
  return (el as unknown as { ref?: Ref<HTMLElement> }).ref ?? undefined;
}

/** Dropdown menu or popover anchored to a trigger element. */
export function Menu({ trigger, items, children, align = 'start', side = 'bottom', width, label, className, onOpenChange }: MenuProps) {
  const [open, setOpenState] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  const pos = useFloating(open, triggerRef, panelRef, { placement: `${side}-${align}`, offset: 8 });
  const isMenu = !children && Array.isArray(items);

  const setOpen = useCallback(
    (v: boolean) => {
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
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
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
    const first = panel.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), [data-autofocus], button, a[href], input');
    (first || panel).focus({ preventScroll: true });
  }, [open, pos]);

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!isMenu || !panelRef.current) return;
    const els = [...panelRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')];
    const i = els.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | null = null;
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
    ref: mergeRefs(elementRef(trigger), triggerRef),
    'aria-haspopup': isMenu ? 'menu' : 'dialog',
    'aria-expanded': open,
    'aria-controls': open ? `menu${uid}` : undefined,
    onClick: (e: MouseEvent<HTMLElement>) => {
      trigger.props.onClick?.(e);
      setOpen(!open);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      trigger.props.onKeyDown?.(e);
      if (isMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) {
        e.preventDefault();
        setOpen(true);
      }
    },
  } as TriggerProps);

  const renderItem = (item: MenuItem, i: number) => {
    if (item.divider) return <div key={`d${i}`} role="separator" className="ui-menu__sep" />;
    if (item.heading != null) {
      return (
        <div key={`h${i}`} className="ui-menu__heading" role="presentation">
          {item.heading}
        </div>
      );
    }
    const action = item as MenuAction;
    const content = (
      <>
        {renderIcon(action.icon, { className: 'ui-menu__icon' })}
        <span className="ui-menu__label">{action.label}</span>
        {action.hint ? <span className="ui-menu__hint">{action.hint}</span> : null}
      </>
    );
    const common = {
      role: 'menuitem',
      tabIndex: -1,
      className: cx('ui-menu__item', action.danger && 'is-danger'),
      'aria-disabled': action.disabled || undefined,
      onClick: (e: MouseEvent<HTMLElement>) => {
        if (action.disabled) {
          e.preventDefault();
          return;
        }
        action.onSelect?.(e);
        close(!action.to && !action.href);
      },
    };
    const key = action.id || i;
    if (action.to) {
      return (
        <Link key={key} {...common} to={action.to}>
          {content}
        </Link>
      );
    }
    if (action.href) {
      return (
        <a key={key} {...common} href={action.href} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      );
    }
    return (
      <button key={key} {...common} type="button">
        {content}
      </button>
    );
  };

  const panelStyle: CSSProperties = { top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden', width };
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
              style={panelStyle}
              onKeyDown={onPanelKeyDown}
            >
              {isMenu ? items.map(renderItem) : children?.({ close })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
