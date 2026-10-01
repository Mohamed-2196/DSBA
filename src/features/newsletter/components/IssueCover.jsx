import { LockSimple } from '@phosphor-icons/react';
import { cx } from '../../../ui';
import { COVER_H, COVER_W, FORECAST, LAUNCH_DOT, LAUNCH_TRACE, PILOT, gridPath } from '../lib/covers.js';
import { issueNo, longDate, shortDate } from '../lib/text.js';
import './IssueCover.css';

// The rough highlighter swipe (same shape as the --highlight-shape token), drawn in SVG.
const SWIPE = 'M4.5 7.2C38 4.6 74 6.1 112 4.2c30-1.4 58 .6 84.6-1.1l2.2 7.1-2.4 9.2 2.6 11.6c-28.9 3.1-61.4 1.4-94.2 2.9-34.4 1.6-66.1-.6-101.2 2.3L.8 27.5l2.9-9.6L1.9 9.4z';
function Swipe({ x, y, w, h }) {
  return <path d={SWIPE} transform={`translate(${x} ${y}) scale(${w / 200} ${h / 40})`} className="nl-cover__swipe" />;
}

function LaunchArt() {
  return (
    <>
      <rect width={COVER_W} height={COVER_H} className="nl-cover__ground" />
      <path d={gridPath({ step: 10 })} className="nl-cover__grid-minor" />
      <path d={gridPath({ step: 50 })} className="nl-cover__grid-major" />
      <path d={LAUNCH_TRACE} className="nl-cover__trace" />
      <circle cx={LAUNCH_DOT.cx} cy={LAUNCH_DOT.cy} r="9" className="nl-cover__dot" />
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
      <Swipe x={196} y={118} w={64} h={26} />
      <text x={228} y={136} textAnchor="middle" className="nl-cover__note">n = 7</text>
    </>
  );
}

function ForecastArt() {
  const f = FORECAST;
  return (
    <>
      <rect width={COVER_W} height={COVER_H} className="nl-cover__ground" />
      {[130, 170, 210, 250, 290].map((y) => (
        <path key={y} d={`M20 ${y}H280`} className="nl-cover__gridline" />
      ))}
      <path d={f.outer} className="nl-cover__fan-outer" />
      <path d={f.inner} className="nl-cover__fan-inner" />
      <path d={`M${f.nowX} 112V300`} className="nl-cover__now" />
      <path d={f.observed} className="nl-cover__observed" />
      <path d={f.forecast} className="nl-cover__forecast" />
      <circle cx={f.end.x} cy={f.end.y} r="6" className="nl-cover__end" />
    </>
  );
}

const ART = { launch: LaunchArt, pilot: PilotArt, forecast: ForecastArt };

/**
 * A generated issue cover (no images): nameplate, number, art, title, date.
 * Rendered as a light "printed" object in both themes (data-theme="light" island).
 * @param issue  { number, title, date, cover }
 * @param locked  overlay "Out <date>" for an upcoming issue
 * @param decorative  hide from assistive tech (when the title is printed next to it)
 */
export function IssueCover({ issue, locked = false, decorative = false, className }) {
  if (!issue) return null;
  const Art = ART[issue.cover] || PilotArt;
  const label = `Cover of The Pulse, issue ${issueNo(issue.number)}: ${issue.title}, ${longDate(issue.date)}`;
  return (
    <div className={cx('nl-cover', `nl-cover--${issue.cover}`, locked && 'is-locked', className)} data-theme="light" data-pulse="issue-cover">
      <svg viewBox={`0 0 ${COVER_W} ${COVER_H}`} className="nl-cover__svg" {...(decorative ? { 'aria-hidden': true, focusable: 'false' } : { role: 'img', 'aria-label': label })}>
        <Art />
        <text x="20" y="45" className="nl-cover__nameplate">The Pulse</text>
        <text x="280" y="45" textAnchor="end" className="nl-cover__no">{issueNo(issue.number)}</text>
        <path d="M20 62H280" className="nl-cover__rule" />
        <text x="20" y="352" className="nl-cover__title">{issue.title}</text>
        <text x="20" y="377" className="nl-cover__date">{longDate(issue.date)}</text>
      </svg>
      {locked ? (
        <span className="nl-cover__lock">
          <LockSimple weight="bold" aria-hidden="true" />
          Out {shortDate(issue.date).replace(/ \d{4}$/, '')}
        </span>
      ) : null}
    </div>
  );
}
