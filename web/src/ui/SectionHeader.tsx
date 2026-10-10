import type { ReactNode } from 'react';
import { cx } from './internal';
import './SectionHeader.css';

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** e.g. <Button variant="ghost" size="sm" to="/forum">View all threads</Button> */
  action?: ReactNode;
  /** heading level (default h2) */
  as?: 'h2' | 'h3' | 'h4';
  /** id of the heading (for aria-labelledby) */
  id?: string;
  className?: string;
  children?: ReactNode;
}

/** Heading row for a page section: title (+ optional description) left, action right. */
export function SectionHeader({ title, description, action, as: H = 'h2', id, className, children }: SectionHeaderProps) {
  return (
    <div className={cx('ui-section-header', className)}>
      <div className="ui-section-header__text">
        <H id={id} className="ui-section-header__title">
          {title}
        </H>
        {description ? <p className="ui-section-header__desc">{description}</p> : null}
        {children}
      </div>
      {action ? <div className="ui-section-header__action">{action}</div> : null}
    </div>
  );
}
