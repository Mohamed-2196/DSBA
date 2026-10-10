import { forwardRef, type ButtonHTMLAttributes, type ElementType } from 'react';
import { Link, type To } from 'react-router-dom';
import { cx, renderIcon, type IconSource } from './internal';
import { Tooltip, type TooltipSide } from './Tooltip';
import './IconButton.css';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLElement>, 'children'> {
  /** required: the accessible name (aria-label) */
  label: string;
  icon: IconSource;
  /** default 'ghost' */
  variant?: 'ghost' | 'secondary' | 'primary';
  /** 32 / 40 / 48px (default 'md') */
  size?: 'sm' | 'md' | 'lg';
  /** true → dot, number → count bubble */
  badge?: boolean | number | null;
  /** show `label` as a tooltip on hover/focus */
  tooltip?: boolean;
  tooltipSide?: TooltipSide;
  /** pressed/selected look (also sets aria-pressed when `toggle`) */
  active?: boolean;
  toggle?: boolean;
  /** internal route → renders <Link> */
  to?: To;
  /** → <a>; absolute URLs open in a new tab */
  href?: string;
  download?: boolean | string;
}

/** Square icon-only button. `label` is required (becomes aria-label). */
export const IconButton = forwardRef<HTMLElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', badge, tooltip = false, tooltipSide = 'bottom', active = false, toggle = false, to, href, className, type, ...rest },
  ref,
) {
  if (!label && import.meta.env.DEV) console.warn('IconButton requires a `label`');
  const Comp: ElementType = to ? Link : href ? 'a' : 'button';
  const props: Record<string, unknown> = {
    ref,
    'aria-label': label,
    className: cx('ui-iconbutton', `ui-iconbutton--${variant}`, `ui-iconbutton--${size}`, active && 'is-active', className),
    ...rest,
  };
  if (Comp === 'button') props.type = type || 'button';
  if (toggle) props['aria-pressed'] = active;
  if (to) props.to = to;
  if (href) {
    props.href = href;
    if (/^(https?:)?\/\//.test(href)) {
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
    }
  }
  const btn = (
    <Comp {...props}>
      {renderIcon(icon, { className: 'ui-iconbutton__icon' })}
      {badge ? (
        <span className={cx('ui-iconbutton__badge', typeof badge === 'number' && 'ui-iconbutton__badge--count')} aria-hidden="true">
          {typeof badge === 'number' ? (badge > 9 ? '9+' : badge) : null}
        </span>
      ) : null}
    </Comp>
  );
  return tooltip ? (
    <Tooltip label={label} side={tooltipSide} describe={false}>
      {btn}
    </Tooltip>
  ) : (
    btn
  );
});
