import { cx } from './internal';
import { initials } from './utils';
import './Avatar.css';

const TONES = ['y1', 'y2', 'y3', 'cobalt', 'signal', 'alert'];
const SIZES = { xs: 20, sm: 24, md: 32, lg: 40, xl: 56 };

/** Deterministic tone index from a string. */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Initials avatar with a deterministic colour per name.
 * @param {string} name
 * @param {'xs'|'sm'|'md'|'lg'|'xl'|number} size  default 'md' (32px)
 * @param {boolean} decorative  hide from screen readers (use when the name is printed next to it)
 */
export function Avatar({ name = '', size = 'md', decorative = false, className, style, title, ...rest }) {
  const px = typeof size === 'number' ? size : SIZES[size] || 32;
  const tone = TONES[hash(name) % TONES.length];
  return (
    <span
      className={cx('ui-avatar', `ui-avatar--${tone}`, className)}
      style={{ width: px, height: px, fontSize: Math.max(9, Math.round(px * 0.38)), ...style }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title || name })}
      title={title}
      {...rest}
    >
      {initials(name)}
    </span>
  );
}
