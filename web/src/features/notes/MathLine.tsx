// A line of a note's text in a list (its name, its start), with its formulas set the way the note sets them. KaTeX
// loads the first time a formula shows (TeX), so a list without one never fetches it.
import { Fragment } from 'react';
import { TeX } from '../../ui';
import type { MathPart } from './text/mathText';

export function MathLine({ parts }: { parts: readonly MathPart[] }) {
  return (
    <>
      {parts.map((p, i) => (p.kind === 'text' ? <Fragment key={i}>{p.text}</Fragment> : <TeX key={i} tex={p.tex} />))}
    </>
  );
}
