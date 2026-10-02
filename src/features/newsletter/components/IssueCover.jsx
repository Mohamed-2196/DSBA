import { cx } from '../../../ui';
import { brandAssetUrl } from '../../../data/brand.js';
import { COVER_H, COVER_W, MARGIN, coverOf, fitLabel, fitLine, numeralBox } from '../lib/covers.js';
import './IssueCover.css';

const RIGHT = COVER_W - MARGIN;

// ── Nameplate ───────────────────────────────────────────────────────────────
// "The DSBA / Newsletter" on two lines, with the highlighter on "DSBA" as on the masthead of /newsletter.
// The swipe is the --highlight-shape token with the climb taken out (the level shape the wordmark uses),
// drawn in SVG; the path fills its 200 x 32.9 box, so x/y/w/h are the swipe's own extent.
const SWIPE_H = 32.9;
const SWIPE = 'M4.5 1.8C38 0 74 2.4 112 1.4C142 0.7 170 3.4 196.6 2.3L198.8 9.5L196.4 18.6L199 30.3C170.1 32.7 137.6 30.2 104.8 30.9C70.4 31.7 38.7 28.7 3.6 30.8L0.8 22L3.7 12.5L1.9 3.9Z';
const SWIPE_LOW = 'M4 25.2C38 23.8 70 26.3 102 25.4C134 24.7 166 26.9 197.8 25.8L198.7 30.5C169.8 32.9 137.3 30.4 104.5 31.1C70.1 31.9 38.4 28.9 3.3 31L2.9 27.9Z';

const PLATE = 30; // font size of the nameplate
const PLATE_Y = [44, 74]; // its two baselines
// Measured at 29px: "DSBA" starts 55.3 after the margin and the swipe is 84.5 wide (0.09em beyond the capitals
// each side); it runs from 0.83em above the baseline to 0.11em below, so the capitals sit fully on the yellow.
const K = PLATE / 29;

function Nameplate() {
  return (
    <g className="nl-cover__plate">
      <g transform={`translate(${MARGIN + 55.3 * K} ${PLATE_Y[0] - 24 * K}) scale(${(84.5 * K) / 200} ${(27.3 * K) / SWIPE_H})`} className="nl-cover__swipe">
        <path d={SWIPE} />
        <path d={SWIPE_LOW} className="nl-cover__swipe-low" />
      </g>
      <text x={MARGIN} y={PLATE_Y[0]} className="nl-cover__nameplate" style={{ fontSize: PLATE }}>
        The <tspan className="nl-cover__dsba">DSBA</tspan>
      </text>
      <text x={MARGIN} y={PLATE_Y[1]} className="nl-cover__nameplate" style={{ fontSize: PLATE }}>
        Newsletter
      </text>
    </g>
  );
}

/** Issue number and date: small, precise, hung from the top margin opposite the nameplate. */
function Folio({ number, date }) {
  return (
    <g className="nl-cover__folio">
      <text x={RIGHT} y="27.2" textAnchor="end">{`Issue ${number}`.toUpperCase()}</text>
      <text x={RIGHT} y="36.8" textAnchor="end">{date.toUpperCase()}</text>
    </g>
  );
}

/**
 * The story index: a label and a cover line per row, on two fixed columns. Every row is set in the same
 * size: the largest (up to labelSize / lineSize) at which the longest label and the longest line still fit.
 */
function Stories({ rows, top, pitch, ruled, labelSize, lineSize, column }) {
  const labelPx = Math.min(...rows.map((r) => fitLabel(r.label, labelSize, column - MARGIN - 6)));
  const linePx = Math.min(...rows.map((r) => fitLine(r.text, lineSize, RIGHT - column)));
  return (
    <g className="nl-cover__stories">
      {rows.map((r, i) => {
        const y = top + i * pitch;
        return (
          <g key={r.id}>
            {ruled && i > 0 ? <path d={`M${MARGIN} ${y - pitch * 0.68}H${RIGHT}`} className="nl-cover__hair" /> : null}
            <text x={MARGIN} y={y} className="nl-cover__label" style={{ fontSize: labelPx }}>
              {r.label.toUpperCase()}
            </text>
            {r.text ? (
              <text x={column} y={y} className="nl-cover__line" style={{ fontSize: linePx }}>
                {r.text}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

// The typographic cover's grid, top to bottom: nameplate, double rule, the numeral standing on NUMERAL_Y,
// the cover line, a rule, the index. Every issue shares these lines, so a shelf of covers lines up.
const NUMERAL_Y = 270.5;
const NUMERAL_MAX = 172; // the tallest the figures may be before they crowd the rules

/** No illustration: the cover is type. Nameplate, rules, the issue numeral across the measure, the index. */
function TypeCover({ cover }) {
  const numeral = numeralBox(cover.number, NUMERAL_MAX);
  return (
    <>
      <Nameplate />
      <Folio number={cover.number} date={cover.date} />
      <path d={`M${MARGIN} 86.5H${RIGHT}`} className="nl-cover__rule nl-cover__rule--heavy" />
      <path d={`M${MARGIN} 90.6H${RIGHT}`} className="nl-cover__rule" />
      <text x={numeral.x} y={NUMERAL_Y} className="nl-cover__numeral" style={{ fontSize: numeral.size }}>
        {cover.number}
      </text>
      <text x={MARGIN} y={NUMERAL_Y + 32.5} className="nl-cover__title" style={{ fontSize: 28.5 }}>
        {cover.title}
      </text>
      <path d={`M${MARGIN} ${NUMERAL_Y + 41.5}H${RIGHT}`} className="nl-cover__rule" />
      <Stories rows={cover.rows.slice(0, 5)} top={NUMERAL_Y + 53.7} pitch={13.2} ruled labelSize={5.7} lineSize={9.2} column={124} />
    </>
  );
}

/** With an illustration: the nameplate on its top quarter, the cover line and three stories on its bottom fifth. */
function ArtCover({ cover }) {
  return (
    <>
      <Nameplate />
      <Folio number={cover.number} date={cover.date} />
      <text x={MARGIN} y="344" className="nl-cover__title" style={{ fontSize: 27 }}>
        {cover.title}
      </text>
      <Stories rows={cover.rows.slice(0, 3)} top={358.8} pitch={11.9} labelSize={5.7} lineSize={9.2} column={124} />
    </>
  );
}

/**
 * An issue cover (see lib/covers.js for the system). A cover is a printed object: it keeps its own colours
 * in dark mode (the sheet is a data-theme="light" island) and scales as one piece.
 * @param issue  { number, title, date, cover, sections }
 * @param decorative  hide from assistive tech (when the title is printed next to it)
 */
export function IssueCover({ issue, decorative = false, className }) {
  if (!issue) return null;
  const cover = coverOf(issue);
  const art = brandAssetUrl(cover.art);
  const label = `Cover of The DSBA Newsletter, issue ${cover.number}: ${cover.title}, ${cover.date}`;
  return (
    <div className={cx('nl-cover', `nl-cover--${cover.tone}`, art ? 'nl-cover--art' : 'nl-cover--type', className)} data-hub="issue-cover">
      <div className="nl-cover__sheet" data-theme="light">
        {art ? <img className="nl-cover__art" src={art} alt="" decoding="sync" /> : null}
        <svg viewBox={`0 0 ${COVER_W} ${COVER_H}`} className="nl-cover__svg" {...(decorative ? { 'aria-hidden': true, focusable: 'false' } : { role: 'img', 'aria-label': label })}>
          {art ? <ArtCover cover={cover} /> : <TypeCover cover={cover} />}
        </svg>
      </div>
    </div>
  );
}
