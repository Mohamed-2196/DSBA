import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { Deskmate } from './deskmates/Deskmate';
import { SECTION_MATE, type MateSection } from './deskmates/mates';
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
  /**
   * A core section's page: the header becomes a band in the section's colour with its deskmate (idle, decorative).
   * A tool's page ('tools': Boards, Grades, Career Navigator) gets the band in Home's blue with no deskmate.
   * On phones the actions sit under the band.
   */
  section?: MateSection | 'tools';
  /** the deskmate in a section band, when it needs more than the default (a pose, Binder's cover); tools have none */
  mate?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Page header pattern: H1 title, one-line description, optional actions (right) and meta row. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  leading,
  section,
  mate,
  className,
  children,
}: PageHeaderProps) {
  const drawn =
    section === 'tools' ? mate : section ? (mate ?? <Deskmate mate={SECTION_MATE[section]} size={100} />) : null;
  return (
    <header
      className={cx(
        'ui-page-header',
        section && 'ui-page-header--band',
        section && !drawn && 'ui-page-header--bare',
        className,
      )}
      data-section={section}
    >
      {drawn ? <div className="ui-page-header__mate">{drawn}</div> : null}
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
