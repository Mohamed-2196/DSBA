import { useEffect, useState } from 'react';
import { cx } from './internal';
import { renderTeX } from './renderTeX';
import './TeX.css';

type Render = (tex: string, display: boolean) => string;

// KaTeX and its stylesheet are fetched the first time a formula is shown, so pages without maths never load them.
let loading: Promise<Render> | null = null;
let ready: Render | null = null;

function loadKatex(): Promise<Render> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([mod]) => {
    ready = (tex, display) => renderTeX(mod.default, tex, display);
    return ready;
  });
  return loading;
}

export interface TeXProps {
  /** the LaTeX, without its $ signs */
  tex: string;
  /** a formula on its own line ($$…$$) rather than in a sentence ($…$) */
  display?: boolean;
  className?: string;
}

/**
 * A formula set by KaTeX. Until KaTeX has loaded (or if it can't), the LaTeX shows as written. KaTeX builds the
 * markup itself from the formula, escaping the text in it, with trust off (renderTeX.ts), so no HTML from the author gets
 * through.
 */
export function TeX({ tex, display = false, className }: TeXProps) {
  const [render, setRender] = useState<Render | null>(() => ready);
  useEffect(() => {
    if (render) return undefined;
    let live = true;
    loadKatex()
      .then((r) => {
        if (live) setRender(() => r);
      })
      .catch(() => {
        loading = null; // offline: try again next time
      });
    return () => {
      live = false;
    };
  }, [render]);

  const Tag = display ? 'div' : 'span';
  const cls = cx('ui-tex', display && 'ui-tex--display', className);
  if (!render) {
    return (
      <Tag className={cx(cls, 'is-raw')} dir="ltr">
        {display ? `$$${tex}$$` : `$${tex}$`}
      </Tag>
    );
  }
  // KaTeX output: built from the formula with trust off (renderTeX.ts), never the author's own markup.
  return <Tag className={cls} dir="ltr" dangerouslySetInnerHTML={{ __html: render(tex, display) }} />;
}
