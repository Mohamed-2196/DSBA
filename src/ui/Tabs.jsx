import { useLayoutEffect, useRef, useState } from 'react';
import { cx, renderIcon } from './internal.js';
import './Tabs.css';

/**
 * Controlled tabs (automatic activation, arrow keys / Home / End). Pair with <TabPanel>.
 * URL-driven:  const [tab, setTab] = useQueryParam('tab', 'overview');
 *              <Tabs idBase="module" tabs={[...]} value={tab} onChange={setTab} label="Module sections" />
 *              <TabPanel idBase="module" id="overview" value={tab}>…</TabPanel>
 * @param {{ id: string, label: node, icon?, count?: number, disabled?: boolean }[]} tabs
 * @param {'underline'|'pill'} variant
 */
export function Tabs({ tabs, value, onChange, label, idBase = 'tabs', variant = 'underline', size = 'md', className, ...rest }) {
  const listRef = useRef(null);
  const [ink, setInk] = useState(null);
  const index = tabs.findIndex((t) => t.id === value);

  useLayoutEffect(() => {
    const el = index >= 0 ? listRef.current?.querySelectorAll('[role="tab"]')[index] : null;
    if (!el) {
      setInk(null);
      return undefined;
    }
    const measure = () => setInk({ x: el.offsetLeft, w: el.offsetWidth });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [index, tabs.length]);

  const focusTab = (i) => listRef.current?.querySelectorAll('[role="tab"]')[i]?.focus();
  const onKeyDown = (e) => {
    const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    const pos = enabled.indexOf(index);
    let next = null;
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
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={cx('ui-tabs', `ui-tabs--${variant}`, `ui-tabs--${size}`, className)}
      onKeyDown={onKeyDown}
      {...rest}
    >
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

/** Panel for <Tabs>. Hidden (not unmounted when keepMounted) unless `value === id`. */
export function TabPanel({ idBase = 'tabs', id, value, keepMounted = false, className, children, ...rest }) {
  const selected = value === id;
  if (!selected && !keepMounted) return null;
  return (
    <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} hidden={!selected} tabIndex={0} className={cx('ui-tabpanel', className)} {...rest}>
      {children}
    </div>
  );
}
