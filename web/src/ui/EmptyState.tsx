import type { ReactNode } from 'react';
import { cx, renderIcon, type IconSource } from './internal';
import './EmptyState.css';

/** The spot illustrations in web/public/illustrations, one per kind of empty. */
export type EmptyIllustration = 'nothing-due' | 'no-notes' | 'offline' | 'search';

export interface EmptyStateProps {
  /** Phosphor component, e.g. ChatsCircle (duotone weight is applied) */
  icon?: IconSource | null;
  /** a small decorative scene shown in place of the icon */
  illustration?: EmptyIllustration;
  /** what's empty, plainly ("No threads yet") */
  title?: ReactNode;
  /** the title as a heading, when the state is the whole page (focusable from script, for a screen reader) */
  titleAs?: 'p' | 'h1' | 'h2';
  titleId?: string;
  /** what to do next */
  body?: ReactNode;
  /** a <Button/> (or several) */
  action?: ReactNode;
  size?: 'md' | 'sm';
  className?: string;
  children?: ReactNode;
}

/** Empty state that invites action. */
export function EmptyState({ icon, illustration, title, titleAs: Title = 'p', titleId, body, action, size = 'md', className, children }: EmptyStateProps) {
  return (
    <div className={cx('ui-empty', `ui-empty--${size}`, className)}>
      {illustration ? (
        <div className="ui-empty__art">
          <img src={`/illustrations/empty-${illustration}.png`} alt="" width={800} height={600} decoding="async" />
        </div>
      ) : icon ? (
        <div className="ui-empty__icon">{renderIcon(icon, { weight: 'duotone' })}</div>
      ) : null}
      {title ? (
        <Title className="ui-empty__title" id={titleId} tabIndex={Title === 'p' ? undefined : -1}>
          {title}
        </Title>
      ) : null}
      {body ? <p className="ui-empty__body">{body}</p> : null}
      {children}
      {action ? <div className="ui-empty__action">{action}</div> : null}
    </div>
  );
}
