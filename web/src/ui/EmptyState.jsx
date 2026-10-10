import { cx, renderIcon } from './internal';
import './EmptyState.css';

/**
 * Empty state that invites action. Use a Phosphor icon (duotone weight is applied).
 * @param icon    Phosphor component, e.g. ChatsCircle
 * @param title   what's empty, plainly ("No threads yet")
 * @param body    what to do next
 * @param action  a <Button/>
 * @param {'md'|'sm'} size
 */
export function EmptyState({ icon, title, body, action, size = 'md', className, children }) {
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
