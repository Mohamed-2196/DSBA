import { cx } from './internal';
import './SectionHeader.css';

/**
 * Heading row for a page section: title (+ optional description) left, action right.
 * @param {string|node} title
 * @param {node} action    e.g. <Button variant="ghost" size="sm" to="/forum">View all threads</Button>
 * @param {'h2'|'h3'} as   heading level (default h2)
 */
export function SectionHeader({ title, description, action, as: H = 'h2', id, className, children }) {
  return (
    <div className={cx('ui-section-header', className)}>
      <div className="ui-section-header__text">
        <H id={id} className="ui-section-header__title">{title}</H>
        {description ? <p className="ui-section-header__desc">{description}</p> : null}
        {children}
      </div>
      {action ? <div className="ui-section-header__action">{action}</div> : null}
    </div>
  );
}
