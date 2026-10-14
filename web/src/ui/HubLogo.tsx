import type { CSSProperties, HTMLAttributes } from 'react';
import { HUB_LOGO, HUB_LOGO_SRC, brandAssetUrl } from '../data/brand';
import './BrandLogo.css';
import { cx } from './internal';
import './HubLogo.css';

const NAME = 'DSBA Hub';
// The lockup's letters stand this share of `size` tall, so it sits on the same line as the slot's other uses.
const LOCKUP_SCALE = 0.7;

export interface HubLogoProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /**
   * 'lockup'  the "DSBA Hub" lockup artwork (headers, footer, sign-in). Without a logo: the name as text.
   * 'tile'    the logo by itself in a square slot (an author avatar, a notification icon). Without a
   *           logo: a neutral tile with the initials "DH", styled like the initials avatars.
   */
  variant?: 'lockup' | 'tile';
  /** px. Tile: the square's side. Lockup: the slot it sits in; the artwork is 0.7 of it tall. */
  size?: number;
  /** lockup only: px to indent the name by while there is no logo */
  textInset?: number;
  /** hide from assistive tech (when "DSBA Hub" is printed or labelled next to it) */
  decorative?: boolean;
  /** tile only: render nothing until there is a real logo */
  optional?: boolean;
}

/**
 * The DSBA Hub logo slot. The artwork is data/brand.ts's HUB_LOGO_SRC; while that is null there is
 * deliberately NO symbol anywhere: the name is set as text, and square slots get a neutral initials tile.
 */
export function HubLogo({ size = 32, variant = 'tile', textInset = 0, decorative = false, optional = false, className, style, ...rest }: HubLogoProps) {
  const src = brandAssetUrl(HUB_LOGO_SRC);

  if (variant === 'lockup' && HUB_LOGO) {
    // The artwork reads "DSBA Hub" by itself, a blue copy for light surfaces and a white one for dark.
    const height = Math.round(size * LOCKUP_SCALE);
    const width = Math.round(height * HUB_LOGO.ratio);
    const base = import.meta.env.BASE_URL;
    return (
      <span
        className={cx('ui-hublogo', 'ui-hublogo--lockup', 'ui-hublogo--art', 'ui-brandlogo', className)}
        style={{ width, height, ...style }}
        {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': NAME })}
        {...rest}
      >
        <img className="ui-brandlogo__img ui-brandlogo__img--light" src={base + HUB_LOGO.light} alt="" width={width} height={height} decoding="async" />
        <img className="ui-brandlogo__img ui-brandlogo__img--dark" src={base + HUB_LOGO.dark} alt="" width={width} height={height} decoding="async" />
      </span>
    );
  }

  if (variant === 'lockup') {
    return (
      <span
        className={cx('ui-hublogo', 'ui-hublogo--lockup', !src && 'ui-hublogo--text', className)}
        style={{ '--hublogo-size': `${size}px`, marginInlineStart: !src && textInset ? textInset : undefined, ...style } as CSSProperties}
        {...(decorative ? { 'aria-hidden': true } : null)}
        {...rest}
      >
        {/* The name is printed right next to it, so the picture stays silent. */}
        {src ? <img className="ui-hublogo__img" src={src} alt="" width={size} height={size} decoding="async" /> : null}
        <span className="ui-hublogo__name">{NAME}</span>
      </span>
    );
  }

  if (src) {
    // Width and height are attributes (not inline styles) so a placement can still resize it in CSS.
    return (
      <img
        className={cx('ui-hublogo', 'ui-hublogo--tile', 'ui-hublogo__img', className)}
        src={src}
        alt={decorative ? '' : NAME}
        width={size}
        height={size}
        decoding="async"
        style={style}
        {...rest}
      />
    );
  }
  if (optional) return null;
  return (
    <span
      className={cx('ui-hublogo', 'ui-hublogo--tile', 'ui-hublogo--initials', className)}
      style={{ width: size, height: size, lineHeight: `${size}px`, fontSize: Math.max(9, Math.round(size * 0.38)), ...style }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': NAME })}
      {...rest}
    >
      DH
    </span>
  );
}
