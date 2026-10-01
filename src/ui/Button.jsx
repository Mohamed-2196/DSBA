import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { cx, renderIcon } from './internal.js';
import { PulseMark } from './PulseMark.jsx';
import './Button.css';

const isExternal = (href) => typeof href === 'string' && /^(https?:)?\/\//.test(href);

/**
 * Button / link-button.
 * @param {'primary'|'secondary'|'ghost'|'danger'} variant  default 'secondary'
 * @param {'sm'|'md'|'lg'} size  32 / 40 / 48px tall
 * @param leadingIcon / trailingIcon  Phosphor component or element
 * @param to    internal route → renders <Link>;  href → <a> (external hrefs open in a new tab)
 * @param as    any component/element type to render instead
 * @param loading  shows the pulse loader and disables
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', leadingIcon, trailingIcon, as, to, href, external, fullWidth = false, loading = false, disabled, type, className, children, onClick, ...rest },
  ref,
) {
  const Comp = as || (to ? Link : href ? 'a' : 'button');
  const props = {
    ref,
    className: cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, fullWidth && 'ui-button--full', loading && 'is-loading', className),
    onClick,
    ...rest,
  };
  if (Comp === 'button') {
    props.type = type || 'button';
    props.disabled = disabled || loading;
  } else if (disabled || loading) {
    props['aria-disabled'] = true;
    props.tabIndex = -1;
    props.onClick = (e) => e.preventDefault();
  }
  if (to) props.to = to;
  if (href) {
    props.href = href;
    if (external ?? isExternal(href)) {
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
    }
  }
  if (loading) props['aria-busy'] = true;
  return (
    <Comp {...props}>
      {loading ? <PulseMark size={10} animate="loop" tone="current" dot={false} className="ui-button__icon" /> : renderIcon(leadingIcon, { className: 'ui-button__icon' })}
      {children != null && children !== false ? <span className="ui-button__label">{children}</span> : null}
      {renderIcon(trailingIcon, { className: 'ui-button__icon' })}
    </Comp>
  );
});
