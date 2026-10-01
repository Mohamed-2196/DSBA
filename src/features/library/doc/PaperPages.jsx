// Past papers, examiners' reports and exercise sets.
import { COMMENTARY, RUBRIC } from '../data/content.js';
import { Code, Formula, Rich } from './text.jsx';
import { Blocks, DocTable, Figure, Flow, Folio, RunHead } from './parts.jsx';
import { moduleLine, normalTable, reportBlocks, topicForQuestion } from './plan.js';

const letter = (i) => String.fromCharCode(97 + i);

/** One question: stem, formula, table, code, figure, lettered parts with marks. */
function Question({ q, n, seed, marks = true, label = 'Question', answerSpace = false }) {
  return (
    <section className="lib-q">
      <h2 className="lib-q__head">
        <span>{label === 'number' ? `${n}.` : `${label} ${n}`}</span>
        {marks && q.essay ? <span className="lib-q__marks">[{q.essay} marks]</span> : null}
      </h2>
      <p className="lib-q__stem"><Rich text={q.stem} /></p>
      {q.formula ? <Formula tex={q.formula} /> : null}
      {q.table ? <DocTable head={q.table.head} rows={q.table.rows} /> : null}
      {q.code ? <Code src={q.code.src} lang={q.code.lang} /> : null}
      {q.chart && q.chart !== 'series' && q.chart !== 'bars' ? <Figure chart={q.chart} seed={seed} width={400} height={200} /> : null}
      {q.parts ? (
        <ol className="lib-q__parts">
          {q.parts.map(([text, m], i) => (
            <li key={i}>
              <span className="lib-q__label">({letter(i)})</span>
              <span className="lib-q__text"><Rich text={text} /></span>
              {marks ? <span className="lib-q__marks">[{m} marks]</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {answerSpace ? (
        q.chart ? <div className="lib-q__graph" aria-hidden="true" /> : <div className="lib-q__lines" aria-hidden="true" />
      ) : null}
    </section>
  );
}

// ── Past paper ───────────────────────────────────────────────────────────────────────────────────

export function PaperPage({ ctx, spec, index }) {
  const { file } = ctx;
  const runRight = `Examination paper ${file.examYear}, Zone ${file.zone}`;
  if (spec.type === 'paper-cover') {
    return (
      <div className="lib-paper lib-paper--cover">
        <div className="lib-paper__top">
          <span className="lib-paper__prog">Data Science and Business Analytics</span>
          <div className="lib-paper__badge">
            <strong>{file.examYear}</strong>
            <span>Zone {file.zone}</span>
          </div>
        </div>
        {ctx.code ? <div className="lib-paper__code">{ctx.code}</div> : null}
        <h1 className={ctx.code ? 'lib-paper__title' : 'lib-paper__title lib-paper__title--solo'}>{ctx.name}</h1>
        <p className="lib-paper__kind">Examination paper</p>
        <div className="lib-paper__rule" />
        <section className="lib-paper__rubric">
          <h2>Instructions to candidates</h2>
          <ol>
            {RUBRIC.map((r) => <li key={r}>{r}</li>)}
          </ol>
          <p>This paper has {file.pages} pages and {spec.nQ} questions.</p>
        </section>
        <div className="lib-paper__candidate">
          <span>Candidate number</span>
          <span className="lib-paper__boxes" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => <span key={i} />)}
          </span>
        </div>
        <p className="lib-paper__wait">Do not turn over until you are told to begin.</p>
        <p className="lib-doc__turn">Turn over</p>
      </div>
    );
  }
  if (spec.type === 'paper-q') {
    return (
      <div className="lib-paper">
        <RunHead left={moduleLine(ctx)} right={runRight} />
        <Flow fitKey={`${file.id}-${index}`}>
          <Question q={spec.q} n={spec.n} seed={`${file.id}-q${spec.n}`} />
        </Flow>
        <Folio n={index + 1} />
        <p className="lib-doc__turn">{spec.last ? 'End of questions' : 'Turn over'}</p>
      </div>
    );
  }
  if (spec.type === 'paper-table') {
    const rows = normalTable();
    return (
      <div className="lib-paper">
        <RunHead left={moduleLine(ctx)} right={runRight} />
        <h2 className="lib-paper__table-title">Table of the standard normal distribution</h2>
        <p className="lib-paper__table-note">Φ(z) = P(Z ≤ z) for Z ~ N(0, 1). Rows give z to one decimal place, columns the second decimal place.</p>
        <DocTable className="lib-doc__table--z" head={['z', '.00', '.01', '.02', '.03', '.04', '.05', '.06', '.07', '.08', '.09']} rows={rows} />
        <Folio n={index + 1} />
      </div>
    );
  }
  return (
    <div className="lib-paper lib-paper--end">
      <RunHead left={moduleLine(ctx)} right={runRight} />
      <p className="lib-paper__endnote">{spec.type === 'paper-end' ? 'End of paper' : 'This page has been left blank intentionally.'}</p>
      <Folio n={index + 1} />
    </div>
  );
}

// ── Examiners' report ────────────────────────────────────────────────────────────────────────────

export function ReportPage({ ctx, spec, index }) {
  const { file } = ctx;
  const runRight = `Examiners’ commentaries ${file.examYear}`;
  if (spec.type === 'report-cover') {
    return (
      <div className="lib-report lib-report--cover">
        <p className="lib-report__eyebrow">Examiners’ commentaries {file.examYear}</p>
        {ctx.code ? <div className="lib-report__code">{ctx.code}</div> : null}
        <h1 className="lib-report__title">{ctx.name}</h1>
        <div className="lib-report__note">
          <p className="lib-doc__box-title">Important note</p>
          <p>This commentary describes the {file.examYear} examination. The format of future examinations may differ, so check the course page on the VLE for the latest information.</p>
        </div>
        <Flow fitKey={`${file.id}-${index}`}>
          <h2 className="lib-doc__h2" data-keep-next="">General remarks</h2>
          {COMMENTARY.general.slice(0, 3).map((p) => <p key={p} className="lib-doc__p">{p}</p>)}
          <h3 className="lib-doc__h3" data-keep-next="">Key steps to improvement</h3>
          <ol className="lib-doc__steps">
            {COMMENTARY.steps.slice(0, 4).map((s) => <li key={s}>{s}</li>)}
          </ol>
          <p className="lib-doc__p">{COMMENTARY.general[3]}</p>
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  if (spec.type === 'report-summary') {
    const summaries = ['Definitions stated, then applied', 'Every step of the derivation shown', 'A labelled diagram, referred to in the text', 'A clear interpretation of the result', 'Assumptions checked before use', 'Answered the question that was set'];
    return (
      <div className="lib-report">
        <RunHead left={moduleLine(ctx)} right={runRight} />
        <Flow fitKey={`${file.id}-${index}`}>
          <h2 className="lib-doc__h2" data-keep-next="">Summary by question</h2>
          <p className="lib-doc__p">The table lists the topic of each question and what distinguished the strongest answers.</p>
          <DocTable
            className="lib-doc__table--wide"
            numeric={false}
            head={['Question', 'Topic', 'Strong answers']}
            rows={spec.qs.map((q, i) => [String(i + 1), topicForQuestion(ctx, q), summaries[i % summaries.length]])}
          />
          <p className="lib-doc__p">{COMMENTARY.general[4]}</p>
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  const { q } = spec;
  return (
    <div className="lib-report">
      <RunHead left={moduleLine(ctx)} right={runRight} />
      <Flow fitKey={`${file.id}-${index}`}>
        <h2 className="lib-doc__h2" data-keep-next="">{spec.k === 0 ? `Question ${spec.n}` : `Question ${spec.n}, continued`}</h2>
        {spec.k === 0 ? (
          <div className="lib-report__question">
            <p><Rich text={q.stem} /></p>
            {q.formula ? <Formula tex={q.formula} /> : null}
            {q.parts ? (
              <ol className="lib-report__parts">
                {q.parts.map(([t], i) => (
                  <li key={i}>
                    <span>({letter(i)})</span> <Rich text={t} />
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
        <Blocks blocks={reportBlocks(ctx, spec)} figureLabel={`Figure ${spec.n}.`} figureStart={spec.k} />
      </Flow>
      <Folio n={index + 1} />
    </div>
  );
}

// ── Exercise set ─────────────────────────────────────────────────────────────────────────────────

export function ExercisePage({ ctx, spec, index }) {
  const { file } = ctx;
  const unit = spec.unit;
  const runLeft = `${moduleLine(ctx)}`;
  const runRight = `Exercise set ${unit?.no ?? ''}`;
  if (spec.type === 'ex-answers') {
    return (
      <div className="lib-ex">
        <RunHead left={runLeft} right={runRight} />
        <Flow fitKey={`${file.id}-${index}`}>
          <h2 className="lib-ex__answers-title" data-keep-next="">Answers</h2>
          <p className="lib-doc__p">Short answers to check your work. Bring full solutions to the tutorial.</p>
          <ol className="lib-ex__answers">
            {spec.qs.map((q, i) => (
              <li key={i}>
                <span className="lib-ex__answer-n">{i + 1}</span>
                <span>{q.answer ? <Rich text={q.answer} /> : q.essay ? 'Essay question: plan your answer, then compare it with the marking points discussed in the tutorial.' : 'Discussion question: compare your answer with a partner, then with the tutorial notes.'}</span>
              </li>
            ))}
          </ol>
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  if (spec.type === 'ex-practice') {
    return (
      <div className="lib-ex">
        <RunHead left={runLeft} right={runRight} />
        <Flow fitKey={`${file.id}-${index}`}>
          <h2 className="lib-doc__h2" data-keep-next="">Further practice</h2>
          {ctx.bank.activities.map((a, i) => (
            <section key={i} className="lib-q">
              <h2 className="lib-q__head"><span>{`P${i + 1}.`}</span></h2>
              <p className="lib-q__stem"><Rich text={a} /></p>
              <div className="lib-q__lines" aria-hidden="true" />
            </section>
          ))}
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  const first = spec.type === 'ex-title';
  return (
    <div className="lib-ex">
      {first ? (
        <header className="lib-ex__head">
          <p className="lib-ex__module">{moduleLine(ctx)}</p>
          <h1 className="lib-ex__title">Exercise set {unit?.no}</h1>
          <p className="lib-ex__unit">{unit?.title}</p>
          <p className="lib-ex__intro">Work through these before the tutorial. Short answers are on the last page.</p>
        </header>
      ) : (
        <RunHead left={runLeft} right={runRight} />
      )}
      <Flow fitKey={`${file.id}-${index}`} className={first ? 'lib-ex__flow--first' : undefined}>
        {spec.qs.map((q, i) => (
          <Question key={i} q={q} n={spec.start + i} seed={`${file.id}-e${spec.start + i}`} marks={false} label="number" answerSpace />
        ))}
      </Flow>
      <Folio n={index + 1} />
    </div>
  );
}
