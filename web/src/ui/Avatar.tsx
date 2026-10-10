import type { HTMLAttributes } from 'react';
import { cx } from './internal';
import { initials } from './utils';
import './Avatar.css';

const TONES = ['y1', 'y2', 'y3', 'cobalt', 'signal', 'alert'] as const;
const SIZES = { xs: 20, sm: 24, md: 32, lg: 40, xl: 56 } as const;

export type AvatarSize = keyof typeof SIZES | number;

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  name?: string;
  /** default 'md' (32px) */
  size?: AvatarSize;
  /** hide from screen readers (use when the name is printed next to it) */
  decorative?: boolean;
}

/** Deterministic tone index from a string. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Initials avatar with a deterministic colour per name. */
export function Avatar({ name = '', size = 'md', decorative = false, className, style, title, ...rest }: AvatarProps) {
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
