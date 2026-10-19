import { type SVGAttributes } from 'react';
import { cx } from './internal';
import type { Glyph } from './icons/glyph';
import './Icon.css';

interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'children' | 'fill' | 'stroke' | 'strokeWidth'> {
  /** the drawing: `glyph.library`, `glyph.close` … (`import { glyph } from 'src/ui'`) */
  glyph: Glyph;
  /** 24 in the tab and top bars, 20 in the sidebar, buttons and fields, 16 inline with meta text. Default: 1em. */
  size?: 16 | 20 | 24;
  /** the active state: a heavier line, the body in the section's art colour, paper in its pill colour */
  active?: boolean;
  /** names a meaningful icon (role="img"); without it the icon is decoration and hidden from screen readers */
  label?: string;
  /** a Phosphor weight passed by ui helpers that render either family; brand icons have one weight */
  weight?: string;
}

/**
 * A brand icon: a two-tone 24 px drawing whose line is the text colour, whose body takes --icon-tint and whose paper
 * parts take --icon-paper (both fall back to the section tokens, and to Home's colours outside a section).
 */
export function Icon({ glyph, size, active = false, label, weight: _weight, className, ...rest }: IconProps) {
  const dim = size ?? '1em';
  return (
    <svg
      viewBox="0 0 24 24"
      width={dim}
      height={dim}
      className={cx('ui-icon', active && 'is-active', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: false })}
      {...rest}
    >
      {glyph.map(([kind, d], i) => (
        <path key={i} className={kind === 'l' ? undefined : `ui-icon__${kind}`} d={d} />
      ))}
    </svg>
  );
}
