// The style guide's table of Daily's game colours: each fill with the text it carries, in both themes, and the
// contrast the browser gives it (text needs 4.5:1). Measured live, so a change to a token shows here.
import { useEffect, useRef, useState } from 'react';
import { contrastRatio, over, parseColor } from '../../../lib/contrast';
import '../daily.css';

const PAIRS: readonly (readonly [fill: string, text: string, use: string])[] = [
  ['--dy-hit', '--dy-on-hit', 'The Word: in the right place'],
  ['--dy-near', '--dy-on-near', 'The Word: elsewhere in the word'],
  ['--dy-miss', '--dy-on-miss', 'The Word: not in the word'],
  ['--dy-pick', '--dy-on-pick', 'A picked word, cell or letter'],
  ['--dy-l1', '--dy-on-l1', 'Correlations: level 1, yellow'],
  ['--dy-l2', '--dy-on-level', 'Correlations: level 2, green'],
  ['--dy-l3', '--dy-on-level', 'Correlations: level 3, blue'],
  ['--dy-l4', '--dy-on-level', 'Correlations: level 4, purple'],
  ['--dy-find-0', '--dy-on-find-0', 'Data Mine: the first find, yellow'],
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => [`--dy-find-${n}`, '--ink', `Data Mine: find colour ${n + 1}`] as const),
];

function Sample({ fill, text, theme }: { fill: string; text: string; theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    const page = el?.parentElement;
    if (!el || !page) return;
    const fg = parseColor(getComputedStyle(el).color);
    const bg = parseColor(getComputedStyle(el).backgroundColor);
    const base = parseColor(getComputedStyle(page).backgroundColor);
    if (fg && bg && base) setRatio(contrastRatio(over(fg, over(bg, base)), over(bg, base)));
  }, []);
  return (
    <span className="dy dy-colours__island" data-theme={theme}>
      <span ref={ref} className="dy-colours__sample" style={{ background: `var(${fill})`, color: `var(${text})` }}>
        Aa <span className="dy-num">{ratio === null ? '' : `${ratio.toFixed(1)}:1`}</span>
      </span>
    </span>
  );
}

export function GameColours() {
  return (
    <ul role="list" className="dy-colours">
      {PAIRS.map(([fill, text, use]) => (
        <li key={fill} className="dy-colours__row">
          <Sample fill={fill} text={text} theme="light" />
          <Sample fill={fill} text={text} theme="dark" />
          <span className="dy-colours__text">
            <code>{fill}</code> with <code>{text}</code>
            <span className="dy-colours__use">{use}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
