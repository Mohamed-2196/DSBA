import { r1 } from '../lib/seed.js';
import './Nameplate.css';

// A "name plate": words in Newsreader display, underlined by the brand trace. The trace runs
// flat under the words, spikes to cap height beside them and ends in the highlighter "now" dot.
// One SVG (viewBox 1180 wide) so the composition is identical at every width.
const W = 1180;
// Brand trace (ui/HubMark MARK_PATH, baseline 15), stretched: up ×13.8, down ×7, across ×6.2.
const FEATURES = [[11, 12.6], [13.5, 15.8], [16.2, 14.4], [19.6, 3.4], [23.6, 20.6], [26.6, 12.4], [29.6, 15.4], [33.2, 13.6], [37, 15]];

function tracePath({ rule, startX, peakY }) {
  const up = (rule - peakY) / 11.6; // the brand spike rises 11.6 units above its baseline
  const sx = (x) => r1(startX + (x - 8.5) * 6.2);
  const sy = (y) => r1(rule + (y < 15 ? (y - 15) * up : (y - 15) * 7));
  return `M2 ${rule}H${startX}${FEATURES.map(([x, y]) => `L${sx(x)} ${sy(y)}`).join('')}H${W - 14}`;
}

/**
 * @param text       the words (one line)
 * @param fontSize   in viewBox units
 * @param textWidth  natural advance of `text` at fontSize, weight 600, −0.03em (measured; also used as textLength)
 * @param tone       'ink' (on paper) | 'inverse' (on navy)
 * @param skipInk    break the trace around descenders (a halo in the ground colour; ground must match the tone)
 * @param label      accessible name (defaults to text)
 */
export function NamePlate({ text, fontSize, textWidth, tone = 'ink', skipInk = false, label, className }) {
  const ascent = fontSize * 0.75;
  const base = Math.round(ascent + 12);
  const rule = Math.round(base + fontSize * 0.15);
  const height = Math.round(rule + 48);
  const d = tracePath({ rule, startX: textWidth + 36, peakY: base - ascent + 4 });
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={['nl-plate', `nl-plate--${tone}`, className].filter(Boolean).join(' ')} role="img" aria-label={label || text}>
      <path d={d} className="nl-plate__trace" />
      <path d={`M${W - 14} ${rule}h0`} className="nl-plate__ring" />
      <path d={`M${W - 14} ${rule}h0`} className="nl-plate__dot" />
      <text x="0" y={base} textLength={textWidth} lengthAdjust="spacing" className={skipInk ? 'nl-plate__text nl-plate__text--skip' : 'nl-plate__text'} style={{ fontSize }}>
        {text}
      </text>
    </svg>
  );
}

/** The DSBA Newsletter nameplate (the /newsletter masthead). */
export function Nameplate({ className }) {
  // 812 = advance of "The DSBA Newsletter" at 184px, weight 600, −0.03em (measured in Chromium).
  return <NamePlate text="The DSBA Newsletter" fontSize={184} textWidth={812} className={className} />;
}
