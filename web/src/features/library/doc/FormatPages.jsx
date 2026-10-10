// Slides (PPTX), spreadsheets (XLSX), notebooks (IPYNB) and scripts (R).
import { cx } from '../../../ui';
import { cycle, rngFor } from '../data/random';
import { MiniChart } from './MiniChart';
import { Code, Rich } from './text';
import { DocTable, Flow, Folio } from './parts';
import { moduleLine, sentences, sheetData } from './plan';

// ── Slides ───────────────────────────────────────────────────────────────────────────────────────

export function SlidePage({ ctx, spec, index }) {
  const { file, bank, units } = ctx;
  const deckName = file.title.replace(/\s+–\s+.*$/, '');
  const foot = (
    <footer className="lib-slide__foot">
      <span>{ctx.code} {deckName.toLowerCase()}</span>
      <span>{index + 1}</span>
    </footer>
  );
  if (spec.type === 'slide-title') {
    return (
      <div className="lib-slide lib-slide--title">
        <span className="lib-slide__ghost" aria-hidden="true">{ctx.code}</span>
        <p className="lib-slide__kicker">{ctx.code} {ctx.name}</p>
        <h1 className="lib-slide__hero">{deckName}</h1>
        <p className="lib-slide__lede">Every chapter on one deck, with the frameworks you need for the exam.</p>
        <p className="lib-slide__author">{file.author}</p>
      </div>
    );
  }
  if (spec.type === 'slide-agenda') {
    return (
      <div className="lib-slide">
        <h2 className="lib-slide__title">What this deck covers</h2>
        <ol className="lib-slide__agenda">
          {units.map((u) => (
            <li key={u.no}>
              <span>{u.no}</span>
              {u.title}
            </li>
          ))}
        </ol>
        {foot}
      </div>
    );
  }
  if (spec.type === 'slide-section') {
    return (
      <div className={cx('lib-slide lib-slide--section', `lib-slide--y${file.year}`)}>
        <span className="lib-slide__num">{String(spec.n).padStart(2, '0')}</span>
        <h2 className="lib-slide__section">{spec.unit.title}</h2>
        {foot}
      </div>
    );
  }
  if (spec.type === 'slide-check') {
    const q = spec.q;
    return (
      <div className="lib-slide">
        <p className="lib-slide__tag">Quick check</p>
        <h2 className="lib-slide__title lib-slide__title--q"><Rich text={q.stem} /></h2>
        {q.parts ? (
          <ul className="lib-slide__bullets">
            {q.parts.map(([t]) => <li key={t}><Rich text={t} /></li>)}
          </ul>
        ) : (
          <p className="lib-slide__plain">Plan your answer in five minutes: an introduction, three arguments with examples, and a conclusion.</p>
        )}
        {foot}
      </div>
    );
  }
  if (spec.type === 'slide-summary') {
    return (
      <div className="lib-slide">
        <h2 className="lib-slide__title">Summary</h2>
        <ul className="lib-slide__bullets lib-slide__bullets--two">
          {bank.outcomes.map((o) => <li key={o}>{o[0].toUpperCase() + o.slice(1)}</li>)}
        </ul>
        {foot}
      </div>
    );
  }
  // content slide
  const rng = rngFor(file.id, 'slide', index);
  const bullets = sentences(cycle(bank.paragraphs, Math.floor(rng() * 20))).concat(sentences(cycle(bank.paragraphs, Math.floor(rng() * 20) + 1))).slice(0, 4);
  const defs = [0, 1, 2, 3].map((i) => cycle(bank.definitions, Math.floor(rng() * 6) + i));
  return (
    <div className="lib-slide lib-slide--content">
      <h2 className="lib-slide__title">{spec.unit.title}</h2>
      <div className="lib-slide__body">
        <ul className="lib-slide__bullets">
          {bullets.map((b) => <li key={b}>{b}</li>)}
        </ul>
        {spec.variant === 0 ? (
          <div className="lib-slide__boxes">
            {defs.map(([t, d]) => (
              <div key={t} className="lib-slide__box">
                <strong>{t}</strong>
                <span>{d}</span>
              </div>
            ))}
          </div>
        ) : spec.variant === 1 ? (
          <figure className="lib-slide__chart">
            <MiniChart kind={cycle(bank.charts, index)} seed={`${file.id}-s${index}`} width={460} height={300} />
          </figure>
        ) : (
          <div className="lib-slide__idea">
            <p className="lib-slide__tag">Key idea</p>
            <p className="lib-slide__idea-term">{defs[0][0]}</p>
            <p className="lib-slide__idea-text">{defs[0][1]}</p>
          </div>
        )}
      </div>
      {foot}
    </div>
  );
}

// ── Spreadsheets ─────────────────────────────────────────────────────────────────────────────────

function DecisionTree() {
  const branch = [
    { y: 70, label: 'Launch', emv: '47.0', outs: [['High 0.40', '120'], ['Medium 0.35', '40'], ['Low 0.25', '−60']] },
    { y: 230, label: 'Small launch', emv: '36.0', outs: [['High 0.40', '70'], ['Medium 0.35', '30'], ['Low 0.25', '−10']] },
    { y: 370, label: 'Do not launch', emv: '0.0', outs: [] },
  ];
  return (
    <svg className="lib-sheet__tree" viewBox="0 0 900 430" width="900" height="430" aria-hidden="true">
      <rect x="20" y="200" width="34" height="34" className="lib-tree__decision" />
      <text x="37" y="258" textAnchor="middle" className="lib-tree__emv">47.0</text>
      {branch.map((b) => (
        <g key={b.label}>
          <path d={`M54 217 L180 217 L260 ${b.y + 17}`} className="lib-tree__edge" />
          <text x="186" y={b.y < 217 ? b.y + 8 : b.y + 40} className="lib-tree__label">{b.label}</text>
          {b.outs.length ? (
            <>
              <circle cx="300" cy={b.y + 17} r="18" className={cx('lib-tree__chance', b.label === 'Launch' && 'is-best')} />
              <text x="300" y={b.y + 52} textAnchor="middle" className="lib-tree__emv">{b.emv}</text>
              {b.outs.map(([o, v], i) => {
                const y = b.y - 30 + i * 47;
                return (
                  <g key={o}>
                    <path d={`M318 ${b.y + 17} L420 ${y + 17} L640 ${y + 17}`} className="lib-tree__edge" />
                    <text x="440" y={y + 10} className="lib-tree__label">{o}</text>
                    <path d={`M640 ${y + 5} L660 ${y + 17} L640 ${y + 29} Z`} className="lib-tree__end" />
                    <text x="676" y={y + 22} className="lib-tree__value">{v}</text>
                  </g>
                );
              })}
            </>
          ) : (
            <>
              <path d={`M260 ${b.y + 17} L640 ${b.y + 17}`} className="lib-tree__edge" />
              <path d={`M640 ${b.y + 5} L660 ${b.y + 17} L640 ${b.y + 29} Z`} className="lib-tree__end" />
              <text x="676" y={b.y + 22} className="lib-tree__value">0</text>
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

export function SheetPage({ ctx, spec }) {
  const data = sheetData(ctx, spec.sheet);
  const rowCount = Math.max(24, data.rows.length + 2);
  return (
    <div className="lib-sheet">
      <div className="lib-sheet__bar">
        <span className="lib-sheet__ref">{data.ref}</span>
        <span className="lib-sheet__fx">fx</span>
        <span className="lib-sheet__formula">{data.formula}</span>
      </div>
      <div className="lib-sheet__grid" style={{ gridTemplateColumns: `44px 210px repeat(${data.cols.length - 1}, 118px) 1fr` }}>
        <span className="lib-sheet__corner" />
        {data.cols.map((c) => <span key={c} className="lib-sheet__col">{c}</span>)}
        <span className="lib-sheet__col" />
        {Array.from({ length: rowCount }, (_, r) => {
          const row = data.rows[r] || [];
          return [
            <span key={`n${r}`} className="lib-sheet__rownum">{r + 1}</span>,
            ...data.cols.map((c, j) => {
              const cell = row[j];
              return (
                <span
                  key={`${c}${r}`}
                  className={cx(
                    'lib-sheet__cell',
                    cell?.num && 'is-num',
                    cell?.b && 'is-bold',
                    cell?.i && 'is-italic',
                    cell?.big && 'is-big',
                    cell?.neg && 'is-neg',
                    cell?.fill && `is-${cell.fill}`,
                    cell?.sel && 'is-selected',
                  )}
                >
                  {cell?.v ?? ''}
                </span>
              );
            }),
            <span key={`x${r}`} className="lib-sheet__cell" />,
          ];
        })}
      </div>
      {data.drawing === 'tree' ? (
        <div className="lib-sheet__float lib-sheet__float--tree">
          <DecisionTree />
        </div>
      ) : null}
      {data.chart ? (
        <figure className={cx('lib-sheet__float', data.chart.full && 'lib-sheet__float--full')} style={data.chart.full ? undefined : { top: 40 + 26 * (data.rows.length + 2) + 18 }}>
          <figcaption>{data.chart.title}</figcaption>
          <MiniChart kind={data.chart.kind} seed={`${ctx.file.id}-${spec.sheet}`} width={data.chart.full ? 760 : 520} height={data.chart.full ? 420 : 300} />
        </figure>
      ) : null}
      <div className="lib-sheet__tabs">
        {spec.tabs.map((t, i) => (
          <span key={t} className={cx('lib-sheet__tab', i === spec.active && 'is-active')}>{t}</span>
        ))}
      </div>
    </div>
  );
}

// ── Notebooks ────────────────────────────────────────────────────────────────────────────────────

export function NotebookPage({ ctx, spec, index }) {
  const { file } = ctx;
  return (
    <div className="lib-nb">
      <Flow fitKey={`${file.id}-${index}`}>
        {spec.cells.map((c, i) => {
          if (c.md) {
            return c.title ? (
              <div key={i} className="lib-nb__md lib-nb__md--title" data-keep-next="">
                <p className="lib-nb__module">{moduleLine(ctx)}</p>
                <h1>{c.title}</h1>
                <p>{c.text}</p>
              </div>
            ) : (
              <div key={i} className="lib-nb__md" data-keep-next="">
                <p>{c.text}</p>
              </div>
            );
          }
          return (
            <div key={i} className="lib-nb__cell">
              <div className="lib-nb__in">
                <span className="lib-nb__prompt">In [{c.n}]:</span>
                <Code src={c.src} lang={c.lang} className="lib-nb__code" />
              </div>
              {c.out ? (
                <div className="lib-nb__out">
                  <span className="lib-nb__prompt lib-nb__prompt--out">{c.out.chart ? '' : `Out[${c.n}]:`}</span>
                  {c.out.table ? (
                    <DocTable className="lib-nb__table" head={c.out.table.head} rows={c.out.table.rows} />
                  ) : c.out.chart ? (
                    <MiniChart kind={c.out.chart} seed={`${file.id}-nb${c.n}`} width={480} height={220} />
                  ) : (
                    <pre className="lib-nb__text">{c.out.text}</pre>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </Flow>
      <Folio n={index + 1} />
    </div>
  );
}

// ── R scripts ────────────────────────────────────────────────────────────────────────────────────

export function ScriptPage({ ctx, spec, index }) {
  const { file } = ctx;
  return (
    <div className="lib-script">
      <header className="lib-script__head">
        <span>{file.fileName}</span>
        <span>Page {index + 1} of {file.pages}</span>
      </header>
      <Code src={spec.lines.join('\n')} lang="r" numbers={spec.start + 1} className="lib-script__code" />
    </div>
  );
}
