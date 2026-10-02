import { cx } from './internal.js';
import './BrandLogo.css';

// Partner marks (public/brand). Navy marks ship with a white twin for dark surfaces; the crest
// works on both. Sizes are the trimmed artwork's aspect ratios.
const LOGOS = {
  bibf: { light: 'brand/bibf.png', dark: 'brand/bibf-white.png', ratio: 515 / 160, alt: 'BIBF' },
  myclass: { light: 'brand/myclass.png', dark: 'brand/myclass-white.png', ratio: 292 / 240, alt: 'BIBF MyClass' },
  uol: { light: 'brand/uol.png', dark: null, ratio: 307 / 400, alt: 'University of London' },
  // the hub's own wordmark (supplied by the student rep; see data/brand.js)
  dsba: { light: 'brand/dsba-logo.png', dark: 'brand/dsba-logo-white.png', ratio: 2095 / 521, alt: 'DSBA' },
};

/**
 * A partner logo that follows the theme (also inside nested data-theme islands).
 * @param {'bibf'|'myclass'|'uol'|'dsba'} name
 * @param {number} height  px; width follows the artwork
 * @param {boolean} decorative  hide from assistive tech (when a text label sits next to it)
 */
export function BrandLogo({ name, height = 24, decorative = false, className }) {
  const logo = LOGOS[name];
  if (!logo) return null;
  const base = import.meta.env.BASE_URL;
  const width = Math.round(height * logo.ratio);
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': logo.alt };
  return (
    <span className={cx('ui-brandlogo', className)} style={{ width, height }} {...a11y}>
      <img className={cx('ui-brandlogo__img', logo.dark && 'ui-brandlogo__img--light')} src={base + logo.light} alt="" width={width} height={height} decoding="async" />
      {logo.dark ? <img className="ui-brandlogo__img ui-brandlogo__img--dark" src={base + logo.dark} alt="" width={width} height={height} decoding="async" /> : null}
    </span>
  );
}

/** BIBF + University of London side by side, with an optional line of text. */
export function ProgrammeLockup({ size = 'md', children, className }) {
  const h = size === 'lg' ? 34 : size === 'sm' ? 18 : 24;
  return (
    <div className={cx('ui-lockup', `ui-lockup--${size}`, className)}>
      <span className="ui-lockup__marks">
        <BrandLogo name="bibf" height={h} />
        <span className="ui-lockup__rule" aria-hidden="true" />
        <BrandLogo name="uol" height={Math.round(h * 1.7)} />
      </span>
      {children ? <p className="ui-lockup__text">{children}</p> : null}
    </div>
  );
}
