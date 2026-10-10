import { forwardRef } from 'react';
import { cx } from './internal';
import './Panel.css';

/**
 * A bordered surface. Use it when a surface is actually needed (a grouped tool, a table, a
 * sidebar block) — not to box every item. Lists of rows usually want no panel per row.
 * @param {'none'|'sm'|'md'|'lg'} padding  0 / 16 / 24 / 32px (default 'md')
 * @param {'panel'|'feature'} radius        16px (default) | 24px for large feature panels
 * @param {'surface'|'inset'} tone          white surface (default) | surface-2 inset
 * @param {boolean} float                   floating layer shadow (menus, active document page only)
 */
export const Panel = forwardRef(function Panel({ as: Comp = 'section', padding = 'md', radius = 'panel', tone = 'surface', float = false, className, children, ...rest }, ref) {
  return (
    <Comp ref={ref} className={cx('ui-panel', `ui-panel--pad-${padding}`, `ui-panel--${radius}`, `ui-panel--${tone}`, float && 'ui-panel--float', className)} {...rest}>
      {children}
    </Comp>
  );
});
