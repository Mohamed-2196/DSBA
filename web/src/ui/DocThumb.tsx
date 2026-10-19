import { cx } from './internal';
import './DocThumb.css';

/**
 * The document families a thumbnail is drawn for: a past paper (yellow band, ruled lines), a report or solutions
 * (green band, a tick), a student's note (violet band, a scribble), a guide or reading (blue band, ruled lines) and a
 * link to another site (grey band, ruled lines).
 */
export type DocTone = 'paper' | 'report' | 'note' | 'guide' | 'link';

/**
 * A small drawn document (docs/design/deskmates/screens/components.svg, "doc thumbnails"): white paper, the art
 * outline, a coloured band that says what kind of file it is. Decoration beside a title that names the file.
 * Sizes: sm 20 px wide (table cells), md 32 px (lists), lg 40 px (the library's index cards).
 */
export function DocThumb({
  tone,
  size = 'md',
  className,
}: {
  tone: DocTone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 40"
      className={cx('ui-doc', `ui-doc--${tone}`, `ui-doc--${size}`, className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect className="ui-doc__paper" x="1.25" y="1.25" width="29.5" height="37.5" rx="5" />
      <path className="ui-doc__band" d="M1.25 10.5V6.25a5 5 0 0 1 5-5h19.5a5 5 0 0 1 5 5v4.25z" />
      <path className="ui-doc__rule" d="M1.25 10.5h29.5" />
      {tone === 'report' ? (
        <path className="ui-doc__tick" d="M8.5 24.5l5 5 10-10.5" />
      ) : tone === 'note' ? (
        <path className="ui-doc__scribble" d="M7 22c3-3.5 6-3.5 9 0s6 3.5 9 0M7 30c3-3.5 6-3.5 9 0s6 3.5 9 0" />
      ) : (
        <path className="ui-doc__lines" d="M7.5 18h17M7.5 24h17M7.5 30h11" />
      )}
      <rect className="ui-doc__edge" x="1.25" y="1.25" width="29.5" height="37.5" rx="5" />
    </svg>
  );
}
