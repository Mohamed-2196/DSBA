import { cx } from './internal.js';
import './Kbd.css';

/** Keyboard key, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd>. */
export function Kbd({ className, children, ...rest }) {
  return (
    <kbd className={cx('ui-kbd', className)} {...rest}>
      {children}
    </kbd>
  );
}
