import { useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cx, renderIcon, type IconSource } from './internal';
import './Tabs.css';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: IconSource | null;
  count?: number | null;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs: TabItem<T>[];
  value: T | null | undefined;
  onChange?: (id: T) => void;
  /** accessible name of the tab list */
  label?: string;
  /** prefix of the tab and panel ids (pair with <TabPanel idBase>) */
  idBase?: string;
  variant?: 'underline' | 'pill';
  size?: 'sm' | 'md';
}

/**
 * Controlled tabs (automatic activation, arrow keys / Home / End). Pair with <TabPanel>.
 * URL-driven:  const [tab, setTab] = useQueryParam('tab', 'overview');
 *              <Tabs idBase="module" tabs={[...]} value={tab} onChange={setTab} label="Module sections" />
 *              <TabPanel idBase="module" id="overview" value={tab}>…</TabPanel>
 */
export function Tabs<T extends string = string>({ tabs, value, onChange, label, idBase = 'tabs', variant = 'underline', size = 'md', className, ...rest }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);
  const index = tabs.findIndex((t) => t.id === value);

  useLayoutEffect(() => {
    const list = listRef.current;
    const el = index >= 0 ? list?.querySelectorAll<HTMLElement>('[role="tab"]')[index] : null;
    if (!list || !el) {
      setInk(null);
      return undefined;
    }
    const measure = () => setInk({ x: el.offsetLeft, w: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [index, tabs.length]);

  const focusTab = (i: number) => listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    const pos = enabled.indexOf(index);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next == null) return;
    e.preventDefault();
    onChange?.(tabs[next].id);
    focusTab(next);
  };

  return (
    <div ref={listRef} role="tablist" aria-label={label} className={cx('ui-tabs', `ui-tabs--${variant}`, `ui-tabs--${size}`, className)} onKeyDown={onKeyDown} {...rest}>
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${t.id}`}
            tabIndex={selected || (index < 0 && t === tabs[0]) ? 0 : -1}
            disabled={t.disabled}
            className={cx('ui-tab', selected && 'is-selected')}
            onClick={() => onChange?.(t.id)}
          >
            {renderIcon(t.icon, { className: 'ui-tab__icon' })}
            <span>{t.label}</span>
            {t.count != null ? <span className="ui-tab__count">{t.count}</span> : null}
          </button>
        );
      })}
      {ink && variant === 'underline' ? <span className="ui-tabs__ink" aria-hidden="true" style={{ width: ink.w, transform: `translateX(${ink.x}px)` }} /> : null}
      {ink && variant === 'pill' ? <span className="ui-tabs__pill" aria-hidden="true" style={{ width: ink.w, transform: `translateX(${ink.x}px)` }} /> : null}
    </div>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  idBase?: string;
  /** this panel's tab id */
  id: string;
  /** the selected tab id */
  value: string | null | undefined;
  /** keep it mounted (hidden) when another tab is selected */
  keepMounted?: boolean;
}

/** Panel for <Tabs>. Hidden (not unmounted when keepMounted) unless `value === id`. */
export function TabPanel({ idBase = 'tabs', id, value, keepMounted = false, className, children, ...rest }: TabPanelProps) {
  const selected = value === id;
  if (!selected && !keepMounted) return null;
  return (
    <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} hidden={!selected} tabIndex={0} className={cx('ui-tabpanel', className)} {...rest}>
      {children}
    </div>
  );
}
