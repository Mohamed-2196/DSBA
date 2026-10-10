import { cx } from './internal';
import './Page.css';

/**
 * Page container: centred column, max-width 1180px (wide 1440 / narrow 760), page padding.
 * Every page renders inside one <Page>. Sections inside are separated by 48px (use <PageSection>).
 */
export function Page({ width = 'default', className, children, ...rest }) {
  return (
    <div className={cx('ui-page', `ui-page--${width}`, className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * Page header pattern: H1 title, one-line description, optional actions (right) and meta row.
 * @param {node} title        sentence case, no trailing period
 * @param {node} description  one sentence, ≤ 72ch
 * @param {node} actions      buttons, right-aligned on desktop
 * @param {node} meta         chips/badges row under the description
 * @param {node} leading      element above the title (e.g. a big unit code set with u-code, or an icon)
 */
export function PageHeader({ title, description, actions, meta, leading, className, children }) {
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

/** A page section with the standard 48px rhythm. Pass aria-labelledby for named regions. */
export function PageSection({ as: Comp = 'section', className, children, ...rest }) {
  return (
    <Comp className={cx('ui-page-section', className)} {...rest}>
      {children}
    </Comp>
  );
}
