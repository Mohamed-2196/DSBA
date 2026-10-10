import type { HTMLAttributes } from 'react';
import { cx } from './internal';
import './Divider.css';

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: 'horizontal' | 'vertical';
  /** px of margin on both sides */
  spacing?: number;
}

/** Hairline divider. */
export function Divider({ orientation = 'horizontal', spacing, className, style, ...rest }: DividerProps) {
  const s = spacing != null ? (orientation === 'vertical' ? { marginInline: spacing } : { marginBlock: spacing }) : null;
  return <hr aria-orientation={orientation} className={cx('ui-divider', `ui-divider--${orientation}`, className)} style={{ ...s, ...style }} {...rest} />;
}
