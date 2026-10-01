import { cx } from './internal.js';
import './Divider.css';

/** Hairline divider. orientation 'horizontal' (default) | 'vertical'; spacing in px (margin on both sides). */
export function Divider({ orientation = 'horizontal', spacing, className, style, ...rest }) {
  const s = spacing != null ? (orientation === 'vertical' ? { marginInline: spacing } : { marginBlock: spacing }) : null;
  return <hr aria-orientation={orientation} className={cx('ui-divider', `ui-divider--${orientation}`, className)} style={{ ...s, ...style }} {...rest} />;
}
