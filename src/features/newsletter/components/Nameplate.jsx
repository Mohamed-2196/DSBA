import { cx } from '../../../ui';
import './Nameplate.css';

/**
 * "The DSBA Newsletter" in Newsreader, with the highlighter swipe on "DSBA". Pure text (real glyphs,
 * selectable, one accessible name): whoever places it sets the font size. Used inline in run-heads.
 * Each half sits in its own span so the masthead can break between them on a phone.
 */
export function Wordmark({ className }) {
  return (
    <span className={cx('nl-wordmark', className)}>
      <span className="nl-wordmark__line">
        The <span className="nl-wordmark__mark">DSBA</span>
      </span>{' '}
      <span className="nl-wordmark__line">Newsletter</span>
    </span>
  );
}

/**
 * The /newsletter nameplate. One line that spans the column where there is room, two lines
 * ("The DSBA" over "Newsletter") on a phone; either way sized from the width of its container, so the
 * words fill the measure at 1920 and at 390. The masthead rule underneath belongs to the page.
 */
export function Nameplate({ className }) {
  return <Wordmark className={cx('nl-plate', className)} />;
}
