import { cx } from './internal';
import './BrandLogo.css';

interface LogoArt {
  light: string;
  dark: string | null;
  ratio: number;
  alt: string;
}

// Partner marks (public/brand). Navy marks ship with a white twin for dark surfaces; the crest
// works on both. Sizes are the trimmed artwork's aspect ratios.
const LOGOS = {
  bibf: { light: 'brand/bibf.png', dark: 'brand/bibf-white.png', ratio: 515 / 160, alt: 'BIBF' },
  myclass: { light: 'brand/myclass.png', dark: 'brand/myclass-white.png', ratio: 292 / 240, alt: 'BIBF MyClass' },
  uol: { light: 'brand/uol.png', dark: null, ratio: 307 / 400, alt: 'University of London' },
} satisfies Record<string, LogoArt>;

export type BrandLogoName = keyof typeof LOGOS;

export interface BrandLogoProps {
  name: BrandLogoName;
  /** px; width follows the artwork */
  height?: number;
  /** hide from assistive tech (when a text label sits next to it) */
  decorative?: boolean;
  className?: string;
}

/** A partner logo that follows the theme (also inside nested data-theme islands). */
export function BrandLogo({ name, height = 24, decorative = false, className }: BrandLogoProps) {
  const logo: LogoArt | undefined = LOGOS[name];
  if (!logo) return null;
  const base = import.meta.env.BASE_URL;
  const width = Math.round(height * logo.ratio);
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': logo.alt };
  return (
    <span className={cx('ui-brandlogo', className)} style={{ width, height }} {...a11y}>
      <img
        className={cx('ui-brandlogo__img', logo.dark && 'ui-brandlogo__img--light')}
        src={base + logo.light}
        alt=""
        width={width}
        height={height}
        decoding="async"
      />
      {logo.dark ? (
        <img
          className="ui-brandlogo__img ui-brandlogo__img--dark"
          src={base + logo.dark}
          alt=""
          width={width}
          height={height}
          decoding="async"
        />
      ) : null}
    </span>
  );
}
