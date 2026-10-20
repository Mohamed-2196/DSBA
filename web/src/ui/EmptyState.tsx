import type { ReactNode } from 'react';
import { Deskmate } from './deskmates/Deskmate';
import type { MateName } from './deskmates/types';
import { cx, renderIcon, type IconSource } from './internal';
import './EmptyState.css';

/** The spot illustrations in web/public/illustrations: only being offline has one; empty lists have a deskmate. */
export type EmptyIllustration = 'offline';

export interface EmptyStateProps {
  /** a brand glyph (`glyph.forum`) or an element */
  icon?: IconSource | null;
  /** the section's deskmate, asleep, shown in place of the icon: jot (no notes), blink (nothing due), binder (no
   *  lessons or modules), loupe (no results), pip-pod (no threads), stacks (no files) */
  mate?: MateName;
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
export function EmptyState({
  icon,
  mate,
  illustration,
  title,
  titleAs: Title = 'p',
  titleId,
  body,
  action,
  size = 'md',
  className,
  children,
}: EmptyStateProps) {
  return (
    <div className={cx('ui-empty', `ui-empty--${size}`, className)}>
      {mate ? (
        <div className="ui-empty__mate">
          <Deskmate mate={mate} state="sleepy" size={size === 'sm' ? 112 : 160} />
        </div>
      ) : illustration ? (
        <div className="ui-empty__art">
          <img
            src={`/illustrations/empty-${illustration}.png`}
            alt=""
            width={800}
            height={600}
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : icon ? (
        <div className="ui-empty__icon">{renderIcon(icon)}</div>
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
