import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './internal';
import './Highlight.css';

export interface HighlightProps extends HTMLAttributes<HTMLElement> {
  /** element (default <mark>) */
  as?: ElementType;
  /** swipe in on mount (left → right). Respects reduced motion. */
  animate?: boolean;
  /** ms before the swipe starts */
  delay?: number;
  children?: ReactNode;
}

/** Highlighter swipe behind inline text (rough-edged marker). Wraps across lines. */
export function Highlight({ as: Comp = 'mark', animate = false, delay = 0, className, style, children, ...rest }: HighlightProps) {
  const css: CSSProperties | undefined = animate ? ({ '--hl-delay': `${delay}ms`, ...style } as CSSProperties) : style;
  return (
    <Comp className={cx('ui-highlight', animate && 'ui-highlight--animate', className)} style={css} {...rest}>
      {children}
    </Comp>
  );
}
