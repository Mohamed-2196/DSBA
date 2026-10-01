// Text primitives for mock pages: inline math markup, formula blocks, highlighted code.
import { Fragment } from 'react';
import { tokenize } from './highlight.js';

/** Parse x^{2} / x_{i} markup into <sup>/<sub>. */
function parseMath(s, keyBase = 'm') {
  const out = [];
  let buf = '';
  let i = 0;
  let k = 0;
  while (i < s.length) {
    const ch = s[i];
    if ((ch === '^' || ch === '_') && s[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      for (; j < s.length; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      if (buf) {
        out.push(buf);
        buf = '';
      }
      const Tag = ch === '^' ? 'sup' : 'sub';
      out.push(<Tag key={`${keyBase}${k++}`}>{parseMath(s.slice(i + 2, j), `${keyBase}${k}-`)}</Tag>);
      i = j + 1;
    } else {
      buf += ch;
      i += 1;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inline rich text: math markup, plus optional highlighter marks over key terms (students' notes).
 * @param {string[]} marks  terms to highlight (first occurrence of each)
 */
export function Rich({ text, marks }) {
  const s = String(text ?? '');
  if (!marks || !marks.length) return <>{parseMath(s)}</>;
  const re = new RegExp(`(${marks.map(escapeRe).join('|')})`, 'i');
  const m = re.exec(s);
  if (!m) return <>{parseMath(s)}</>;
  const before = s.slice(0, m.index);
  const after = s.slice(m.index + m[0].length);
  return (
    <>
      {parseMath(before, 'b')}
      <mark className="lib-doc__hl">{m[0]}</mark>
      {parseMath(after, 'a')}
    </>
  );
}

/** Display formula (JetBrains Mono), one line per \n. */
export function Formula({ tex, className = 'lib-doc__formula' }) {
  const lines = String(tex).split('\n');
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <span key={i} className="lib-doc__formula-line">
          {parseMath(line, `l${i}-`)}
        </span>
      ))}
    </div>
  );
}

/** Highlighted code. `numbers` (start line) renders a line-number gutter. */
export function Code({ src, lang = 'python', className = 'lib-doc__code', numbers = null }) {
  if (numbers != null) {
    const lines = String(src).split('\n');
    return (
      <div className={className}>
        {lines.map((line, i) => (
          <div key={i} className="lib-doc__code-row">
            <span className="lib-doc__ln" aria-hidden="true">{numbers + i}</span>
            <span className="lib-doc__code-text">{line ? <Tokens src={line} lang={lang} /> : ' '}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <pre className={className}>
      <Tokens src={src} lang={lang} />
    </pre>
  );
}

function Tokens({ src, lang }) {
  return (
    <>
      {tokenize(src, lang).map((t, i) =>
        t.t === 'plain' ? <Fragment key={i}>{t.v}</Fragment> : <span key={i} className={`lib-tk lib-tk--${t.t}`}>{t.v}</span>,
      )}
    </>
  );
}
