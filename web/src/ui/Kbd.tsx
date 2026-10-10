import type { HTMLAttributes } from 'react';
import { cx } from './internal';
import './Kbd.css';

export type KbdProps = HTMLAttributes<HTMLElement>;

/** Keyboard key, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd>. */
export function Kbd({ className, children, ...rest }: KbdProps) {
  return (
    <kbd className={cx('ui-kbd', className)} {...rest}>
      {children}
    </kbd>
  );
}
