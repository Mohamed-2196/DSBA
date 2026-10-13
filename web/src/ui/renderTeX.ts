// How a formula is handed to KaTeX (TeX.tsx loads KaTeX on demand and calls this). Pure.
import type katex from 'katex';

type Katex = typeof katex;

/** KaTeX's markup for a formula. Students' text stays text: trust off (no \href, \url, \includegraphics or HTML
 *  extensions), a mistake shown in red where it is rather than thrown, and limits on sizes and macro expansion. */
export function renderTeX(k: Pick<Katex, 'renderToString'>, tex: string, display: boolean): string {
  return k.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    maxSize: 20,
    maxExpand: 500,
    output: 'htmlAndMathml', // MathML for screen readers
  });
}
