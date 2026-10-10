import { cx } from './internal';
import './Highlight.css';

/**
 * Highlighter swipe behind inline text (rough-edged marker). Wraps across lines.
 * @param {boolean} animate  swipe in on mount (left → right). Respects reduced motion.
 * @param {number} delay     ms before the swipe starts.
 * @param {'mark'|'span'|string} as  element (default <mark>).
 */
export function Highlight({ as: Comp = 'mark', animate = false, delay = 0, className, style, children, ...rest }) {
  return (
    <Comp
      className={cx('ui-highlight', animate && 'ui-highlight--animate', className)}
      style={animate ? { '--hl-delay': `${delay}ms`, ...style } : style}
      {...rest}
    >
      {children}
    </Comp>
  );
}
