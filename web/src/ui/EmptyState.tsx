import type { ReactNode } from 'react';
import { cx, renderIcon, type IconSource } from './internal';
import './EmptyState.css';

export interface EmptyStateProps {
  /** Phosphor component, e.g. ChatsCircle (duotone weight is applied) */
  icon?: IconSource | null;
  /** what's empty, plainly ("No threads yet") */
  title?: ReactNode;
  /** what to do next */
  body?: ReactNode;
  /** a <Button/> (or several) */
  action?: ReactNode;
  size?: 'md' | 'sm';
  className?: string;
  children?: ReactNode;
}

/** Empty state that invites action. */
export function EmptyState({ icon, title, body, action, size = 'md', className, children }: EmptyStateProps) {
  return (
    <div className={cx('ui-empty', `ui-empty--${size}`, className)}>
      {icon ? <div className="ui-empty__icon">{renderIcon(icon, { weight: 'duotone' })}</div> : null}
      {title ? <p className="ui-empty__title">{title}</p> : null}
      {body ? <p className="ui-empty__body">{body}</p> : null}
      {children}
      {action ? <div className="ui-empty__action">{action}</div> : null}
    </div>
  );
}
