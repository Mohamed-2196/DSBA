import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './internal';
import './Page.css';

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
  /** default 1180px, wide 1440px, narrow 760px */
  width?: 'default' | 'wide' | 'narrow';
}

/**
 * Page container: centred column, max-width 1180px (wide 1440 / narrow 760), page padding.
 * Every page renders inside one <Page>. Sections inside are separated by 48px (use <PageSection>).
 */
export function Page({ width = 'default', className, children, ...rest }: PageProps) {
  return (
    <div className={cx('ui-page', `ui-page--${width}`, className)} {...rest}>
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  /** sentence case, no trailing period */
  title: ReactNode;
  /** one sentence, ≤ 72ch */
  description?: ReactNode;
  /** buttons, right-aligned on desktop */
  actions?: ReactNode;
  /** chips/badges row under the description */
  meta?: ReactNode;
  /** element above the title (e.g. a big unit code set with u-code, or an icon) */
  leading?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Page header pattern: H1 title, one-line description, optional actions (right) and meta row. */
export function PageHeader({ title, description, actions, meta, leading, className, children }: PageHeaderProps) {
  return (
    <header className={cx('ui-page-header', className)}>
      <div className="ui-page-header__main">
        {leading ? <div className="ui-page-header__leading">{leading}</div> : null}
        <h1 className="ui-page-header__title">{title}</h1>
        {description ? <p className="ui-page-header__desc">{description}</p> : null}
        {meta ? <div className="ui-page-header__meta">{meta}</div> : null}
        {children}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export interface PageSectionProps extends HTMLAttributes<HTMLElement> {
  /** element (default <section>) */
  as?: ElementType;
}

/** A page section with the standard 48px rhythm. Pass aria-labelledby for named regions. */
export function PageSection({ as: Comp = 'section', className, children, ...rest }: PageSectionProps) {
  return (
    <Comp className={cx('ui-page-section', className)} {...rest}>
      {children}
    </Comp>
  );
}
