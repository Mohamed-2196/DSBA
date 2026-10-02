import { cx } from './internal.js';
import './HubMark.css';

// The open mark: a short trace that ends on a dot ("now"). viewBox 48×24. Used as the loader, the
// active-nav mark and the start of Home's exam timeline (which continues from the end dot, so keep
// DOT where it is).
const MARK_PATH = 'M3.5 17.4 L15.5 8.2 L28.4 16.6 L44.6 12.9';
const DOT = { cx: 44.6, cy: 12.9 };
// The logo tile: three cohorts joined at one hub. 32×32, brand-blue rounded square.
const HUB = { cx: 16, cy: 16.5 };
const NODES = [
  { cx: 16, cy: 7.4 },
  { cx: 23.9, cy: 21.05 },
  { cx: 8.1, cy: 21.05 },
];
const MARK_TILE_PATH = NODES.map((n) => `M${HUB.cx} ${HUB.cy}L${n.cx} ${n.cy}`).join('');

/**
 * DSBA Hub brand mark.
 * @param {number} size     height in px (the open mark is 2:1, the tile is square). Default 24.
 * @param {false|true|'draw'|'loop'} animate  'draw' (= true) draws once; 'loop' is the loader.
 * @param {'cobalt'|'ink'|'inverse'|'current'} tone  stroke colour (open mark only).
 * @param {boolean} tile    the logo: blue rounded square, three nodes joined at a highlighted hub.
 * @param {boolean} dot     show the end dot / the hub (default true).
 * @param {string} title    accessible name; omit for decorative use (aria-hidden).
 */
export function HubMark({ size = 24, animate = false, tone = 'cobalt', tile = false, dot = true, title, className, style, ...rest }) {
  const mode = animate === true ? 'draw' : animate || null;
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true, focusable: 'false' };
  const cls = cx('ui-mark', tile ? 'ui-mark--tile' : `ui-mark--${tone}`, mode && `ui-mark--${mode}`, className);

  if (tile) {
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} className={cls} style={style} {...a11y} {...rest}>
        {title ? <title>{title}</title> : null}
        <rect className="ui-mark__tile" x="0" y="0" width="32" height="32" rx="9" />
        <path className="ui-mark__trace" d={MARK_TILE_PATH} pathLength="1" strokeWidth="2.3" />
        {NODES.map((n) => <circle key={`${n.cx}-${n.cy}`} className="ui-mark__node" cx={n.cx} cy={n.cy} r="2.9" />)}
        {dot ? <circle className="ui-mark__dot" cx={HUB.cx} cy={HUB.cy} r="4" /> : null}
      </svg>
    );
  }

  // Keep the rendered stroke ~1.5–4px whatever the size.
  const px = Math.min(4, Math.max(1.5, size * 0.095));
  const sw = (px * 24) / size;
  return (
    <svg viewBox="0 0 48 24" width={size * 2} height={size} className={cls} style={style} {...a11y} {...rest}>
      {title ? <title>{title}</title> : null}
      <path className="ui-mark__trace" d={MARK_PATH} pathLength="1" strokeWidth={sw} />
      {dot ? <circle className="ui-mark__dot" cx={DOT.cx} cy={DOT.cy} r={Math.max(1.9, sw * 1.05)} /> : null}
    </svg>
  );
}
