import { cx } from './internal.js';
import './PulseMark.css';

// The pulse trace: a quiet time series with one spike. viewBox 48×24; the end dot is "now".
export const PULSE_PATH = 'M2 15 H8.5 L11 12.6 L13.5 15.8 L16.2 14.4 L19.6 3.4 L23.6 20.6 L26.6 12.4 L29.6 15.4 L33.2 13.6 L37 15 L40.6 12.9 L44.6 12.9';
const DOT = { cx: 44.6, cy: 12.9 };
// Tile (logo lockup / favicon): bolder, simpler trace in a 32×32 navy square.
export const PULSE_TILE_PATH = 'M5 18 H10.2 L12.2 15.6 L14.2 18.6 L16.6 7.6 L19.6 23.6 L21.8 16.6 H26.2';
const TILE_DOT = { cx: 26.2, cy: 16.6 };

/**
 * DSBA Pulse brand trace.
 * @param {number} size     height in px (the open mark is 2:1, the tile is square). Default 24.
 * @param {false|true|'draw'|'loop'} animate  'draw' (= true) draws once; 'loop' is the loader.
 * @param {'cobalt'|'ink'|'inverse'|'current'} tone  stroke colour (open mark only).
 * @param {boolean} tile    navy rounded-square lockup with white trace + highlighter dot.
 * @param {boolean} dot     show the end dot (default true).
 * @param {string} title    accessible name; omit for decorative use (aria-hidden).
 */
export function PulseMark({ size = 24, animate = false, tone = 'cobalt', tile = false, dot = true, title, className, style, ...rest }) {
  const mode = animate === true ? 'draw' : animate || null;
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true, focusable: 'false' };
  const cls = cx('ui-pulse', tile ? 'ui-pulse--tile' : `ui-pulse--${tone}`, mode && `ui-pulse--${mode}`, className);

  if (tile) {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className={cls} style={style} {...a11y} {...rest}>
        {title ? <title>{title}</title> : null}
        <rect className="ui-pulse__tile" x="0" y="0" width="32" height="32" rx="9" />
        <path className="ui-pulse__trace" d={PULSE_TILE_PATH} pathLength="1" strokeWidth="2.6" />
        {dot ? <circle className="ui-pulse__dot" cx={TILE_DOT.cx} cy={TILE_DOT.cy} r="2.5" /> : null}
      </svg>
    );
  }

  // Keep the rendered stroke ~1.5–4px whatever the size.
  const px = Math.min(4, Math.max(1.5, size * 0.095));
  const sw = (px * 24) / size;
  return (
    <svg viewBox="0 0 48 24" width={size * 2} height={size} className={cls} style={style} {...a11y} {...rest}>
      {title ? <title>{title}</title> : null}
      <path className="ui-pulse__trace" d={PULSE_PATH} pathLength="1" strokeWidth={sw} />
      {dot ? <circle className="ui-pulse__dot" cx={DOT.cx} cy={DOT.cy} r={Math.max(1.9, sw * 1.05)} /> : null}
    </svg>
  );
}
