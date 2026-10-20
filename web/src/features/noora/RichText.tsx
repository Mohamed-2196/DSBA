// Her AI's answer drawn as rich text (rich.ts parses it): headings, lists, code, tables and formulas set by the
// Hub's KaTeX renderer. What she writes is only ever a React child, never HTML. Links go only to the Hub's own pages;
// anything else stays as its words.
import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { copyText } from '../../lib/share';
import { TeX, safeInternalPath, Icon, glyph } from '../../ui';
import { parseInline, parseRich, type Block, type Inline } from './rich';

function Inlines({ text, onFollow }: { text: string; onFollow: () => void }) {
  return <>{parseInline(text).map((tok, i) => inline(tok, i, onFollow))}</>;
}

function inline(tok: Inline, key: number, onFollow: () => void): ReactNode {
  switch (tok.type) {
    case 'text':
      return tok.text;
    case 'code':
      return <code key={key}>{tok.text}</code>;
    case 'math':
      return <TeX key={key} tex={tok.tex} />;
    case 'strong':
      return <strong key={key}>{tok.children.map((c, i) => inline(c, i, onFollow))}</strong>;
    case 'em':
      return <em key={key}>{tok.children.map((c, i) => inline(c, i, onFollow))}</em>;
    case 'link': {
      const to = safeInternalPath(tok.href);
      return to ? (
        <Link key={key} to={to} onClick={onFollow}>
          {tok.text}
        </Link>
      ) : (
        tok.text
      );
    }
  }
}

const COPIED_FOR = 1600; // ms the button says it worked

/** A code block with its language and a copy button. */
function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const done = setTimeout(() => setCopied(false), COPIED_FOR);
    return () => clearTimeout(done);
  }, [copied]);
  return (
    <div className="nr-code">
      <div className="nr-code__bar">
        <span className="nr-code__lang">{lang || 'Code'}</span>
        <button
          type="button"
          className="nr-code__copy"
          onClick={() => void copyText(text).then(setCopied)}
          data-hub="noora-copy-code"
        >
          <Icon glyph={copied ? glyph.check : glyph.copy} />
          <span>{copied ? 'Copied' : 'Copy code'}</span>
        </button>
      </div>
      <pre tabIndex={0} aria-label={lang ? `Code, ${lang}` : 'Code'}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

function block(b: Block, key: number, onFollow: () => void): ReactNode {
  switch (b.type) {
    case 'heading':
      return (
        <h3 key={key} className="nr-h">
          <Inlines text={b.text} onFollow={onFollow} />
        </h3>
      );
    case 'p':
      return (
        <p key={key}>
          <Inlines text={b.text} onFollow={onFollow} />
        </p>
      );
    case 'quote':
      return (
        <blockquote key={key}>
          <Inlines text={b.text} onFollow={onFollow} />
        </blockquote>
      );
    case 'ul':
    case 'ol': {
      const items = b.items.map((item, i) => (
        <li key={i}>
          <Inlines text={item} onFollow={onFollow} />
        </li>
      ));
      return b.type === 'ul' ? (
        <ul key={key}>{items}</ul>
      ) : (
        <ol key={key} start={b.start === 1 ? undefined : b.start}>
          {items}
        </ol>
      );
    }
    case 'code':
      return <CodeBlock key={key} lang={b.lang} text={b.text} />;
    case 'math':
      // A formula still being written is shown as it is, not set half-finished.
      return b.open ? (
        <p key={key} className="nr-math is-open" dir="ltr">
          {b.tex}
        </p>
      ) : (
        <div key={key} className="nr-math" tabIndex={0}>
          <TeX tex={b.tex} display />
        </div>
      );
    case 'table':
      return (
        <div key={key} className="nr-table" tabIndex={0} role="region" aria-label="Table">
          <table>
            <thead>
              <tr>
                {b.head.map((cell, c) => (
                  <th key={c} scope="col" style={b.align[c] ? { textAlign: b.align[c] ?? undefined } : undefined}>
                    <Inlines text={cell} onFollow={onFollow} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={b.align[c] ? { textAlign: b.align[c] ?? undefined } : undefined}>
                      <Inlines text={cell} onFollow={onFollow} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr key={key} />;
  }
}

/** An answer in Markdown. `caret`: a cursor after the last block while it streams in. */
export const Rich = memo(function Rich({
  text,
  caret = false,
  onFollow,
}: {
  text: string;
  caret?: boolean;
  onFollow: () => void;
}) {
  const blocks = useMemo(() => parseRich(text), [text]);
  return (
    <div className="nr" dir="auto">
      {blocks.map((b, i) => block(b, i, onFollow))}
      {caret ? <span className="nc-caret" aria-hidden="true" /> : null}
    </div>
  );
});
