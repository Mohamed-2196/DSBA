import { forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cx } from './internal';
import './Panel.css';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** element (default <section>) */
  as?: ElementType;
  /** 0 / 16 / 24 / 32px (default 'md') */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** 16px (default) | 24px for large feature panels */
  radius?: 'panel' | 'feature';
  /** white surface (default) | surface-2 inset */
  tone?: 'surface' | 'inset';
  /** floating layer shadow (menus, active document page only) */
  float?: boolean;
}

/**
 * A bordered surface. Use it when a surface is actually needed (a grouped tool, a table, a
 * sidebar block) — not to box every item. Lists of rows usually want no panel per row.
 */
export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { as: Comp = 'section', padding = 'md', radius = 'panel', tone = 'surface', float = false, className, children, ...rest },
  ref,
) {
  return (
    <Comp ref={ref} className={cx('ui-panel', `ui-panel--pad-${padding}`, `ui-panel--${radius}`, `ui-panel--${tone}`, float && 'ui-panel--float', className)} {...rest}>
      {children}
    </Comp>
  );
});
