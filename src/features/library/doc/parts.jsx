// Shared building blocks of mock pages.
import { useRef } from 'react';
import { cx } from '../../../ui';
import { MiniChart } from './MiniChart.jsx';
import { Code, Formula, Rich } from './text.jsx';
import { useFitFlow } from './useFitFlow.js';

/** The page body: children that don't fit are hidden by useFitFlow. */
export function Flow({ className, fitKey, children }) {
  const ref = useRef(null);
  useFitFlow(ref, fitKey);
  return (
    <div ref={ref} className={cx('lib-doc__flow', className)}>
      {children}
    </div>
  );
}

export function RunHead({ left, right, className }) {
  return (
    <header className={cx('lib-doc__run', className)}>
      <span>{left}</span>
      <span>{right}</span>
    </header>
  );
}

export function Folio({ n, className }) {
  return <footer className={cx('lib-doc__folio', className)}>{n}</footer>;
}

export function DocTable({ head, rows, caption, className, numeric = true }) {
  return (
    <table className={cx('lib-doc__table', className)}>
      {caption ? <caption>{caption}</caption> : null}
      {head ? (
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={numeric && j > 0 && /^[−\-\d.,%\s]+$/.test(String(c)) ? 'is-num' : undefined}>
                <Rich text={c} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Figure({ chart, seed, caption, label, width = 460, height = 220 }) {
  return (
    <figure className="lib-doc__figure">
      <MiniChart kind={chart} seed={seed} width={width} height={height} />
      {caption ? (
        <figcaption>
          {label ? <strong>{label} </strong> : null}
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Render a list of content blocks (see plan.js bodyBlocks).
 * @param marks        terms to highlight (students' notes)
 * @param figureLabel  e.g. 'Figure 3.' → captions read "Figure 3.4" (numbered from figureStart)
 */
export function Blocks({ blocks, marks, figureLabel, figureStart = 1 }) {
  let fig = 0;
  return blocks.map((b, i) => {
    const key = `${b.t}${i}`;
    const margin = b.margin ? <span className="lib-doc__margin" aria-hidden="true">{b.margin}</span> : null;
    switch (b.t) {
      case 'h2':
        return <h2 key={key} className="lib-doc__h2" data-keep-next="">{b.text}</h2>;
      case 'h3':
        return (
          <h3 key={key} className="lib-doc__h3" data-keep-next="">
            {b.mark ? <mark className="lib-doc__hl lib-doc__hl--block">{b.text}</mark> : b.text}
          </h3>
        );
      case 'p':
        return (
          <p key={key} className={cx('lib-doc__p', margin && 'has-margin')}>
            <Rich text={b.text} marks={marks} />
            {margin}
          </p>
        );
      case 'list':
        return (
          <ul key={key} className={cx('lib-doc__list', margin && 'has-margin')}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Rich text={it} marks={j === 0 ? marks : undefined} />
              </li>
            ))}
            {margin}
          </ul>
        );
      case 'def':
        return (
          <div key={key} className="lib-doc__def">
            <span className="lib-doc__def-term">{b.term}</span>
            <span className="lib-doc__def-text"><Rich text={b.text} /></span>
          </div>
        );
      case 'example':
        return (
          <div key={key} className="lib-doc__example">
            <p className="lib-doc__box-title">Example: {b.title}</p>
            <p><Rich text={b.text} /></p>
            {b.formula ? <Formula tex={b.formula} /> : null}
            {b.code ? <Code src={b.code.src} lang={b.code.lang} /> : null}
          </div>
        );
      case 'activity':
        return (
          <div key={key} className="lib-doc__activity">
            <p className="lib-doc__box-title">Activity</p>
            <p><Rich text={b.text} /></p>
          </div>
        );
      case 'formula':
        return <Formula key={key} tex={b.tex} />;
      case 'quote':
        return <blockquote key={key} className="lib-doc__quote"><Rich text={b.text} /></blockquote>;
      case 'part':
        return (
          <p key={key} className="lib-doc__part">
            <span className="lib-doc__part-label">{b.label}</span>
            <span><Rich text={b.text} /></span>
          </p>
        );
      case 'figure':
        fig += 1;
        return <Figure key={key} chart={b.chart} seed={b.seed} caption={b.caption} label={figureLabel ? `${figureLabel}${figureStart + fig - 1}` : null} />;
      case 'table':
        return <DocTable key={key} head={b.head} rows={b.rows} caption={b.caption} />;
      default:
        return null;
    }
  });
}
