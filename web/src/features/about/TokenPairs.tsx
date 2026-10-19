// The style guide's table of text on its grounds: each pair of tokens in both themes, with the contrast the browser
// measures. Text needs 4.5:1. Measured live, so a change to tokens.css shows here at once.
import { useEffect, useRef, useState } from 'react';
import { contrastRatio, over, parseColor } from '../../lib/contrast';
import { cx } from '../../ui';

/** [ground, text, what it is for] */
type Pair = readonly [ground: string, text: string, use: string];

const SECTIONS = ['home', 'library', 'modules', 'notebook', 'forum', 'calendar', 'search'] as const;

const TEXT_PAIRS: readonly Pair[] = [
  ['--paper', '--ink', 'Text on the canvas'],
  ['--paper', '--ink-2', 'Secondary text on the canvas'],
  ['--paper', '--ink-3', 'Meta on the canvas'],
  ['--surface', '--ink-3', 'Meta on a card'],
  ['--surface-2', '--ink-3', 'Meta on an inset'],
  ['--surface', '--accent', 'A link on a card'],
  ['--accent', '--on-accent', 'A primary button'],
  ['--accent-soft', '--accent-text', 'Selected rows, info'],
  ['--inverse', '--on-inverse', 'The Filters pill'],
  ['--surface', '--success', 'Saved, answered'],
  ['--success-soft', '--success', 'A success badge'],
  ['--surface', '--warning', 'A warning'],
  ['--warning-soft', '--warning', 'A warning badge'],
  ['--warning-fill', '--on-warning-fill', 'A count on yellow'],
  ['--surface', '--error', 'An error message'],
  ['--error-soft', '--error', 'An error badge'],
  ['--error', '--on-error', 'A danger button'],
  ['--surface', '--exam', 'An exam date'],
  ['--exam-soft', '--exam', 'An exam badge'],
  ['--exam', '--on-exam', 'A solid exam badge'],
  ['--y1-soft', '--y1-strong', 'Year 1'],
  ['--y2-soft', '--y2-strong', 'Year 2'],
  ['--y3-soft', '--y3-strong', 'Year 3'],
  ['--y2', '--on-y2', 'Text on a cohort fill'],
  ...SECTIONS.map((s) => [`--sec-${s}-pill`, `--sec-${s}-text`, `The ${s} pill`] as const),
];

function Sample({ ground, text, theme }: { ground: string; text: string; theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    const island = el?.parentElement;
    if (!el || !island) return;
    const fg = parseColor(getComputedStyle(el).color);
    const bg = parseColor(getComputedStyle(el).backgroundColor);
    const base = parseColor(getComputedStyle(island).backgroundColor);
    if (fg && bg && base) setRatio(contrastRatio(over(fg, over(bg, base)), over(bg, base)));
  }, []);
  return (
    <span className="sg-pairs__island" data-theme={theme}>
      <span
        ref={ref}
        className={cx('sg-pairs__sample', ratio !== null && ratio < 4.5 && 'is-low')}
        style={{ background: `var(${ground})`, color: `var(${text})` }}
      >
        Aa <span className="u-tabular">{ratio === null ? '' : `${ratio.toFixed(2)}:1`}</span>
      </span>
    </span>
  );
}

export function TokenPairs() {
  return (
    <ul role="list" className="sg-pairs">
      {TEXT_PAIRS.map(([ground, text, use]) => (
        <li key={`${ground} ${text}`} className="sg-pairs__row">
          <Sample ground={ground} text={text} theme="light" />
          <Sample ground={ground} text={text} theme="dark" />
          <span className="sg-pairs__text">
            <code>{text}</code> on <code>{ground}</code>
            <span className="sg-pairs__use">{use}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
