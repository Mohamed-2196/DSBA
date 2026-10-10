// Subject guides, essential reading, study guides, students' notes and the cheat sheet.
import { cx } from '../../../ui';
import { RUBRIC, SPECIAL } from '../data/content';
import { cycle, rngFor } from '../data/random';
import { MiniChart } from './MiniChart';
import { Code, Formula, Rich } from './text';
import { Blocks, Flow, Folio, RunHead } from './parts';
import { bodyBlocks, moduleLine, sentences } from './plan';

const COVER_ART = { stats: 'density', econ: 'supply-demand', maths: 'function', prog: 'roc', biz: 'bars', analytics: 'scatter', metrics: 'scatter' };

const unitLabel = (u) => (u ? `${u.noun} ${u.no}: ${u.title}` : '');

// ── Subject guide ────────────────────────────────────────────────────────────────────────────────

export function GuidePage({ ctx, spec, index }) {
  const { file, bank } = ctx;
  const year = file.year;
  if (spec.type === 'guide-cover') {
    return (
      <div className={cx('lib-guide lib-guide--cover', `lib-guide--y${year}`)}>
        <div className="lib-guide__band">
          <p className="lib-guide__prog">Data Science and Business Analytics</p>
          <div className="lib-guide__art" aria-hidden="true">
            <MiniChart kind={COVER_ART[ctx.domain]} seed={`${file.id}-cover`} width={560} height={260} className="lib-chart lib-chart--cover" />
          </div>
          {ctx.code ? <div className="lib-guide__code">{ctx.code}</div> : null}
          <h1 className={ctx.code ? 'lib-guide__title' : 'lib-guide__title lib-guide__title--solo'}>{ctx.name}</h1>
        </div>
        <div className="lib-guide__foot">
          <p className="lib-guide__kind">Subject guide</p>
          <p className="lib-guide__sub">Year {year} module of the BSc in Data Science and Business Analytics</p>
        </div>
      </div>
    );
  }
  if (spec.type === 'guide-contents') {
    return (
      <div className="lib-guide">
        <h1 className="lib-guide__h1">Contents</h1>
        <ol className="lib-toc">
          {spec.entries.map((e) => (
            <li key={`${e.label}${e.page}`} className={e.no ? 'lib-toc__chapter' : undefined}>
              <span className="lib-toc__no">{e.no || ''}</span>
              <span className="lib-toc__label">{e.label}</span>
              <span className="lib-toc__dots" aria-hidden="true" />
              <span className="lib-toc__page">{e.page}</span>
            </li>
          ))}
        </ol>
        <Folio n={index + 1} />
      </div>
    );
  }
  if (spec.type === 'guide-intro') {
    return (
      <div className="lib-guide">
        <Flow fitKey={`${file.id}-${index}`}>
          <h1 className="lib-guide__h1" data-keep-next="">Introduction</h1>
          <p className="lib-doc__p lib-doc__p--lead">This guide takes you through {ctx.name} {ctx.units.length > 1 ? `in ${ctx.units.length} ${ctx.units[0].noun.toLowerCase()}s` : ''}. Read each {ctx.units[0].noun.toLowerCase()} alongside the essential reading, then work through the activities before moving on.</p>
          <h3 className="lib-doc__h3" data-keep-next="">Aims of the course</h3>
          <p className="lib-doc__p">By the end of the course, and having completed the essential reading and activities, you should be able to:</p>
          <ul className="lib-doc__list">
            {bank.outcomes.map((o) => <li key={o}>{o}</li>)}
          </ul>
          <h3 className="lib-doc__h3" data-keep-next="">How to use this guide</h3>
          <p className="lib-doc__p">{bank.paragraphs[0]}</p>
          <p className="lib-doc__p">Each {ctx.units[0].noun.toLowerCase()} ends with a short list of learning outcomes. Use them as a checklist when you revise, and attempt the sample examination paper at the end of the guide under timed conditions.</p>
          <p className="lib-doc__p">{bank.paragraphs[1]}</p>
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  if (spec.type === 'guide-opener') {
    const u = spec.unit;
    const rng = rngFor(file.id, 'opener', u.no);
    const outcomes = [0, 1, 2].map((i) => cycle(bank.outcomes, Math.floor(rng() * 6) + i));
    return (
      <div className={cx('lib-guide', `lib-guide--y${year}`)}>
        <div className="lib-guide__opener">
          <span className="lib-guide__noun">{u.noun}</span>
          <span className="lib-guide__num">{u.no}</span>
          <h1 className="lib-guide__chapter">{u.title}</h1>
        </div>
        <Flow fitKey={`${file.id}-${index}`}>
          <div className="lib-guide__outcomes">
            <p className="lib-doc__box-title">Learning outcomes</p>
            <p>By the end of this {u.noun.toLowerCase()}, and having completed the essential reading and activities, you should be able to:</p>
            <ul>
              {[...new Set(outcomes)].map((o) => <li key={o}>{o}</li>)}
            </ul>
          </div>
          <h3 className="lib-doc__h3" data-keep-next="">Essential reading</h3>
          <p className="lib-doc__p">The {u.noun.toLowerCase()} of the essential reading that covers {u.title.toLowerCase()}. Read it before you start this {u.noun.toLowerCase()}.</p>
          <h3 className="lib-doc__h3" data-keep-next="">Introduction</h3>
          <p className="lib-doc__p">{cycle(bank.paragraphs, Number.parseInt(u.no, 10) || 0)}</p>
          <p className="lib-doc__p">{cycle(bank.paragraphs, (Number.parseInt(u.no, 10) || 0) + 3)}</p>
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  if (spec.type === 'guide-body') {
    const u = spec.unit;
    return (
      <div className="lib-guide">
        <RunHead left={unitLabel(u)} right={moduleLine(ctx)} />
        <Flow fitKey={`${file.id}-${index}`}>
          <Blocks blocks={bodyBlocks(ctx, spec, 'guide')} figureLabel={`Figure ${u.no}.`} figureStart={spec.k} />
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  if (spec.type === 'guide-sample-title') {
    return (
      <div className="lib-guide">
        <Flow fitKey={`${file.id}-${index}`}>
          <h1 className="lib-guide__h1" data-keep-next="">Sample examination paper</h1>
          <p className="lib-doc__p lib-doc__p--lead">Use this paper to practise under timed conditions. The questions are typical of the course, but they do not reproduce a real examination.</p>
          <h3 className="lib-doc__h3" data-keep-next="">Instructions</h3>
          <ol className="lib-doc__steps">
            {RUBRIC.map((r) => <li key={r}>{r}</li>)}
          </ol>
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  if (spec.type === 'guide-sample') {
    return (
      <div className="lib-guide">
        <RunHead left="Sample examination paper" right={moduleLine(ctx)} />
        <Flow fitKey={`${file.id}-${index}`}>
          {spec.qs.map((q, i) => (
            <section key={i} className="lib-q">
              <h2 className="lib-q__head"><span>Question {spec.n + i}</span></h2>
              <p className="lib-q__stem"><Rich text={q.stem} /></p>
              {q.formula ? <Formula tex={q.formula} /> : null}
              {q.parts ? (
                <ol className="lib-q__parts">
                  {q.parts.map(([t, m], j) => (
                    <li key={j}>
                      <span className="lib-q__label">({String.fromCharCode(97 + j)})</span>
                      <span className="lib-q__text"><Rich text={t} /></span>
                      <span className="lib-q__marks">[{m} marks]</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ))}
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  return (
    <div className="lib-guide">
      <h2 className="lib-doc__h2">Notes</h2>
      <div className="lib-doc__ruled" aria-hidden="true" />
      <Folio n={index + 1} />
    </div>
  );
}

// ── Essential reading (a book chapter) ───────────────────────────────────────────────────────────

export function ReadingPage({ ctx, spec, index }) {
  const { file, bank } = ctx;
  const u = spec.unit;
  const even = index % 2 === 1;
  if (spec.type === 'reading-opener') {
    const first = cycle(bank.paragraphs, Number.parseInt(u.no, 10) || 1);
    return (
      <div className="lib-read lib-read--opener">
        <p className="lib-read__chapter">{u.noun} {u.no}</p>
        <h1 className="lib-read__title">{u.title}</h1>
        <Flow fitKey={`${file.id}-${index}`}>
          <p className="lib-read__lead">{first}</p>
          <Blocks blocks={bodyBlocks(ctx, { ...spec, k: 0, continues: true }, 'reading')} figureLabel={`Figure ${u.no}.`} />
        </Flow>
        <Folio n={index + 1} className="lib-read__folio" />
      </div>
    );
  }
  return (
    <div className="lib-read">
      <header className={cx('lib-read__run', even && 'is-even')}>
        <span className="lib-read__run-page">{index + 1}</span>
        <span>{even ? moduleLine(ctx) : `${u.noun} ${u.no}  ${u.title}`}</span>
      </header>
      <Flow fitKey={`${file.id}-${index}`}>
        <Blocks blocks={bodyBlocks(ctx, spec, 'reading')} figureLabel={`Figure ${u.no}.`} figureStart={spec.k} />
      </Flow>
      <p className="lib-read__footnote">
        <sup>{spec.k}</sup> {sentences(cycle(bank.paragraphs, spec.k + 2))[0]}
      </p>
    </div>
  );
}

// ── Revision study guide ─────────────────────────────────────────────────────────────────────────

const WATCH_OUT = [
  'Mixing up population quantities with their sample estimates.',
  'Using a result without first checking that its assumptions hold.',
  'Giving a number without an interpretation in context.',
  'Stopping after the calculation instead of answering the question asked.',
  'Leaving out the units or the scale of a diagram.',
];

export function StudyPage({ ctx, spec, index }) {
  const { file, bank } = ctx;
  if (spec.type === 'study-title') {
    return (
      <div className="lib-study lib-study--title">
        {ctx.code ? <div className="lib-study__code">{ctx.code}</div> : null}
        <h1 className="lib-study__title">Revision study guide</h1>
        <p className="lib-study__module">{ctx.name}</p>
        <p className="lib-doc__p lib-doc__p--lead">A checklist of what to know for each {ctx.units[0].noun.toLowerCase()}, with the key formulas and the mistakes to avoid.</p>
        <div className="lib-study__how">
          <p className="lib-doc__box-title">How to use this guide</p>
          <ol>
            <li>Tick each item only when you can do it without your notes.</li>
            <li>Revisit anything unticked with the subject guide and the essential reading.</li>
            <li>Finish each {ctx.units[0].noun.toLowerCase()} with a question from a recent past paper.</li>
          </ol>
        </div>
        <Folio n={index + 1} />
      </div>
    );
  }
  const u = spec.unit;
  const rng = rngFor(file.id, 'study', spec.k);
  const outcomes = [0, 1, 2].map((i) => cycle(bank.outcomes, Math.floor(rng() * 6) + i));
  const defs = [0, 1].map((i) => cycle(bank.definitions, Math.floor(rng() * 6) + i));
  const formulas = [0, 1, 2, 3].map((i) => cycle(bank.formulas, Math.floor(rng() * 8) + i));
  return (
    <div className="lib-study">
      <RunHead left="Revision study guide" right={moduleLine(ctx)} />
      <Flow fitKey={`${file.id}-${index}`}>
        <h2 className="lib-study__unit" data-keep-next="">{unitLabel(u)}</h2>
        <h3 className="lib-doc__h3" data-keep-next="">Checklist</h3>
        <ul className="lib-study__checks">
          {[...new Set(outcomes)].map((o) => <li key={o}>I can {o}.</li>)}
          {defs.map(([t]) => <li key={t}>I can define {t.toLowerCase()} and give an example.</li>)}
        </ul>
        <h3 className="lib-doc__h3" data-keep-next="">Key formulas</h3>
        <div className="lib-study__formulas">
          {[...new Set(formulas)].map((f) => <Formula key={f} tex={f} />)}
        </div>
        <div className="lib-study__watch">
          <p className="lib-doc__box-title">Watch out for</p>
          <ul>
            {[0, 1, 2].map((i) => <li key={i}>{cycle(WATCH_OUT, spec.k + i)}</li>)}
          </ul>
        </div>
        <h3 className="lib-doc__h3" data-keep-next="">Practice</h3>
        <p className="lib-doc__p">Try a question on this {u.noun.toLowerCase()} from a recent past paper, then compare your answer with the examiners’ report for that year.</p>
      </Flow>
      <Folio n={index + 1} />
    </div>
  );
}

// ── Students' notes ──────────────────────────────────────────────────────────────────────────────

function SpecialBlocks({ section }) {
  return (
    <>
      <h2 className="lib-notes__h2" data-keep-next="">{section.heading}</h2>
      <Blocks blocks={section.blocks} />
    </>
  );
}

export function NotesPage({ ctx, spec, index }) {
  const { file, bank } = ctx;
  const typed = file.format === 'DOCX';
  const cls = cx('lib-notes', typed ? 'lib-notes--typed' : 'lib-notes--ruled');
  const marks = typed ? bank.terms.slice(index % 3, (index % 3) + 4) : bank.terms.slice((index * 2) % bank.terms.length).concat(bank.terms).slice(0, 5);
  const special = ctx.special || SPECIAL.sigma;
  if (spec.type === 'notes-practice') {
    return (
      <div className={cls}>
        <Flow fitKey={`${file.id}-${index}`}>
          <h2 className="lib-notes__h2" data-keep-next="">Practice</h2>
          <ol className="lib-notes__practice">
            {special.practice.map((p, i) => (
              <li key={i}>
                <Rich text={p.q} />
                <span className="lib-doc__margin">{i % 2 ? 'check!' : 'tutorial'}</span>
                <p className="lib-notes__answer"><Rich text={`Answer: ${p.a}`} /></p>
              </li>
            ))}
          </ol>
        </Flow>
        <Folio n={index + 1} />
      </div>
    );
  }
  const title = spec.type === 'notes-title';
  const unit = spec.unit;
  const heading = ctx.special ? ctx.special.title : unit ? `${unit.noun} ${unit.no}: ${unit.title}` : file.title;
  return (
    <div className={cls}>
      {title ? (
        <header className="lib-notes__head">
          <p className="lib-notes__meta">
            <span className="lib-notes__code">{ctx.code || ctx.m?.shortName}</span>
            <span>{ctx.special ? 'Notes' : unit ? `${unit.noun} ${unit.no}` : 'Notes'}</span>
          </p>
          <h1 className="lib-notes__title">
            <mark className="lib-doc__hl lib-doc__hl--title">{ctx.special ? ctx.special.title : unit ? unit.title : file.title}</mark>
          </h1>
          <p className="lib-notes__by">by {file.author}</p>
        </header>
      ) : (
        <RunHead left={heading} right={file.author} className="lib-notes__run" />
      )}
      <Flow fitKey={`${file.id}-${index}`}>
        {ctx.special ? (
          (spec.sections || [0]).map((s) => <SpecialBlocks key={s} section={ctx.special.sections[s]} />)
        ) : (
          <>
            {spec.newUnit ? <h2 className="lib-notes__h2" data-keep-next="">{heading}</h2> : null}
            <Blocks blocks={bodyBlocks(ctx, { ...spec, k: index }, 'notes')} marks={marks} />
          </>
        )}
      </Flow>
      <Folio n={index + 1} />
    </div>
  );
}

// ── Cheat sheet ──────────────────────────────────────────────────────────────────────────────────

export function CheatPage({ ctx, spec, index }) {
  return (
    <div className="lib-cheat">
      {spec.first ? (
        <header className="lib-cheat__head">
          <div>
            <p className="lib-cheat__module">{ctx.code}</p>
            <h1 className="lib-cheat__title">Cheat sheet</h1>
          </div>
          <p className="lib-cheat__sub">R and Python side by side. Keep it next to you while you code.</p>
        </header>
      ) : (
        <RunHead left={`${ctx.code} cheat sheet`} right="R and Python" />
      )}
      <div className="lib-cheat__grid">
        {spec.sections.map((s) => (
          <section key={s.heading} className="lib-cheat__section">
            <h2>{s.heading}</h2>
            <div className="lib-cheat__cols" aria-hidden="true">
              <span />
              <span>R</span>
              <span>Python</span>
            </div>
            {s.rows.map(([task, r, py]) => (
              <div key={task} className="lib-cheat__row">
                <span className="lib-cheat__task">{task}</span>
                <Code src={r} lang={/^git /.test(r) ? 'shell' : 'r'} className="lib-cheat__code" />
                <Code src={py} lang={/^git /.test(py) ? 'shell' : 'python'} className="lib-cheat__code" />
              </div>
            ))}
          </section>
        ))}
      </div>
      <Folio n={index + 1} />
    </div>
  );
}

