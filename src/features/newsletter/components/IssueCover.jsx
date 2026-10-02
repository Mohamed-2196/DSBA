import { cx } from '../../../ui';
import { COVER_H, COVER_W, LAUNCH, PILOT, gridPath } from '../lib/covers.js';
import { issueNo, longDate } from '../lib/text.js';
import './IssueCover.css';

// The rough highlighter swipe: the --highlight-shape token with the climb taken out (the same level shape the
// wordmark uses), drawn in SVG. The path fills its 200 x 32.9 box, so x/y/w/h are the swipe's own extent.
const SWIPE_H = 32.9;
const SWIPE = 'M4.5 1.8C38 0 74 2.4 112 1.4C142 0.7 170 3.4 196.6 2.3L198.8 9.5L196.4 18.6L199 30.3C170.1 32.7 137.6 30.2 104.8 30.9C70.4 31.7 38.7 28.7 3.6 30.8L0.8 22L3.7 12.5L1.9 3.9Z';
const SWIPE_LOW = 'M4 25.2C38 23.8 70 26.3 102 25.4C134 24.7 166 26.9 197.8 25.8L198.7 30.5C169.8 32.9 137.3 30.4 104.5 31.1C70.1 31.9 38.4 28.9 3.3 31L2.9 27.9Z';
function Swipe({ x, y, w, h }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${w / 200} ${h / SWIPE_H})`} className="nl-cover__swipe">
      <path d={SWIPE} />
      <path d={SWIPE_LOW} className="nl-cover__swipe-low" />
    </g>
  );
}

function LaunchArt() {
  const { hub, nodes, rings, spokes } = LAUNCH;
  return (
    <>
      <rect width={COVER_W} height={COVER_H} className="nl-cover__ground" />
      {rings.map((r) => (
        <circle key={r} cx={hub.x} cy={hub.y} r={r} className="nl-cover__ring" />
      ))}
      <path d={spokes} className="nl-cover__spokes" />
      {nodes.map((n) => (
        <circle key={`${n.x}-${n.y}`} cx={n.x} cy={n.y} r="15" className="nl-cover__node" />
      ))}
      <circle cx={hub.x} cy={hub.y} r="22" className="nl-cover__hub" />
    </>
  );
}

function PilotArt() {
  const { points, fit, residuals } = PILOT;
  return (
    <>
      <rect width={COVER_W} height={COVER_H} className="nl-cover__ground" />
      <path d={gridPath({ step: 12 })} className="nl-cover__grid-minor" />
      <path d={gridPath({ step: 60 })} className="nl-cover__grid-major" />
      <path d="M44 112V292H268" className="nl-cover__axis" />
      {residuals.map((r) => (
        <path key={r.x} d={`M${r.x} ${r.y1}V${r.y2}`} className="nl-cover__residual" />
      ))}
      <path d={`M${fit.x1} ${fit.y1}L${fit.x2} ${fit.y2}`} className="nl-cover__fit" />
      {points.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="5.5" className="nl-cover__point" />
      ))}
      <Swipe x={196} y={120} w={64} h={21.5} />
      <text x={228} y={136} textAnchor="middle" className="nl-cover__note">n = 7</text>
    </>
  );
}

const ART = { launch: LaunchArt, pilot: PilotArt };

/**
 * A generated issue cover (no images): nameplate, number, art, title, date.
 * Rendered as a light "printed" object in both themes (data-theme="light" island).
 * @param issue  { number, title, date, cover }
 * @param decorative  hide from assistive tech (when the title is printed next to it)
 */
export function IssueCover({ issue, decorative = false, className }) {
  if (!issue) return null;
  const Art = ART[issue.cover] || PilotArt;
  const label = `Cover of The DSBA Newsletter, issue ${issueNo(issue.number)}: ${issue.title}, ${longDate(issue.date)}`;
  return (
    <div className={cx('nl-cover', `nl-cover--${issue.cover}`, className)} data-theme="light" data-hub="issue-cover">
      <svg viewBox={`0 0 ${COVER_W} ${COVER_H}`} className="nl-cover__svg" {...(decorative ? { 'aria-hidden': true, focusable: 'false' } : { role: 'img', 'aria-label': label })}>
        <Art />
        {/* The nameplate on two lines, with the highlighter on "DSBA" as on the masthead. Swipe: x/w from the
            measured advance of "The " and "DSBA" at 29px (0.09em beyond the capitals each side); y/h from the
            baseline (43): 0.83em above it to 0.11em below, so the capitals sit fully on the yellow. */}
        <Swipe x={75.3} y={19} w={84.5} h={27.3} />
        <text x="20" y="43" className="nl-cover__nameplate">
          The <tspan className="nl-cover__dsba">DSBA</tspan>
        </text>
        <text x="20" y="72" className="nl-cover__nameplate">Newsletter</text>
        <text x="280" y="43" textAnchor="end" className="nl-cover__no">{issueNo(issue.number)}</text>
        <path d="M20 90H280" className="nl-cover__rule" />
        <text x="20" y="352" className="nl-cover__title">{issue.title}</text>
        <text x="20" y="377" className="nl-cover__date">{longDate(issue.date)}</text>
      </svg>
    </div>
  );
}
