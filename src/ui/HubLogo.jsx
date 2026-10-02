import { HUB_LOGO, HUB_LOGO_SRC, brandAssetUrl } from '../data/brand.js';
import { BrandLogo } from './BrandLogo.jsx';
import { cx } from './internal.js';
import './HubLogo.css';

const NAME = 'DSBA Hub';

/**
 * The DSBA Hub logo slot. The artwork is data/brand.js's HUB_LOGO_SRC; while that is null there is
 * deliberately NO symbol anywhere: the name is set as text, and square slots get a neutral initials tile.
 *
 * @param {'lockup'|'tile'} variant
 *   'lockup'  the logo followed by the name "DSBA Hub" (headers, footer). Without a logo: the name alone.
 *   'tile'    the logo by itself in a square slot (an author avatar, a notification icon). Without a
 *             logo: a neutral tile with the initials "DH", styled like the initials avatars.
 * @param {number} size        px. Height of the logo (tile: the square's side). The lockup's type follows it.
 * @param {number} textInset   lockup only: px to indent the name by while there is no logo. A logo sits
 *                             centred over a column of icons; the bare name starts on the icons' left edge.
 * @param {boolean} decorative hide from assistive tech (when "DSBA Hub" is printed or labelled next to it)
 * @param {boolean} optional   tile only: render nothing until there is a real logo (brand presence that
 *                             the layout does not need, e.g. above a heading that already says the name)
 */
export function HubLogo({ size = 32, variant = 'tile', textInset = 0, decorative = false, optional = false, className, style, ...rest }) {
  const src = brandAssetUrl(HUB_LOGO_SRC);

  if (variant === 'lockup' && HUB_LOGO) {
    // The supplied logo is a wordmark that already reads "DSBA": set only "Hub" beside it, on its cap height.
    return (
      <span
        className={cx('ui-hublogo', 'ui-hublogo--lockup', 'ui-hublogo--wordmark', className)}
        style={{ '--hublogo-size': `${size}px`, ...style }}
        {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': NAME })}
        {...rest}
      >
        <BrandLogo name="dsba" height={Math.round(size * 0.68)} decorative />
        <span className="ui-hublogo__name" aria-hidden="true">Hub</span>
      </span>
    );
  }

  if (variant === 'lockup') {
    return (
      <span
        className={cx('ui-hublogo', 'ui-hublogo--lockup', !src && 'ui-hublogo--text', className)}
        style={{ '--hublogo-size': `${size}px`, marginInlineStart: !src && textInset ? textInset : undefined, ...style }}
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
