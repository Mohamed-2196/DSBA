import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ElementType, type MouseEvent, type ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { cx, renderIcon, type IconSource } from './internal';
import { HubMark } from './HubMark';
import './Button.css';

const isExternal = (href: string) => /^(https?:)?\/\//.test(href);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonOwnProps {
  /** default 'secondary' */
  variant?: ButtonVariant;
  /** 32 / 40 / 48px tall (default 'md') */
  size?: ButtonSize;
  /** Phosphor component or element */
  leadingIcon?: IconSource | null;
  trailingIcon?: IconSource | null;
  /** any component/element type to render instead */
  as?: ElementType;
  /** internal route → renders <Link> */
  to?: To;
  /** → <a>; external hrefs open in a new tab */
  href?: string;
  /** open `href` in a new tab (true) or not (false); default: when the URL is absolute */
  external?: boolean;
  fullWidth?: boolean;
  /** shows the loader and disables */
  loading?: boolean;
  children?: ReactNode;
}

/** Native attributes go to the rendered element (<button>, <a> or the Link). */
type NativeAttributes = Omit<ButtonHTMLAttributes<HTMLElement>, keyof ButtonOwnProps> &
  Pick<AnchorHTMLAttributes<HTMLElement>, 'target' | 'rel' | 'download' | 'hrefLang' | 'referrerPolicy'>;

export type ButtonProps = ButtonOwnProps & NativeAttributes;

/** Button / link-button. */
export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', leadingIcon, trailingIcon, as, to, href, external, fullWidth = false, loading = false, disabled, type, className, children, onClick, ...rest },
  ref,
) {
  const Comp: ElementType = as || (to ? Link : href ? 'a' : 'button');
  const props: Record<string, unknown> = {
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
    props.onClick = (e: MouseEvent) => e.preventDefault();
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
      {loading ? <HubMark size={10} animate="loop" tone="current" dot={false} className="ui-button__icon" /> : renderIcon(leadingIcon, { className: 'ui-button__icon' })}
      {children != null && children !== false ? <span className="ui-button__label">{children}</span> : null}
      {renderIcon(trailingIcon, { className: 'ui-button__icon' })}
    </Comp>
  );
});
