import { useCallback, useState, type ReactNode } from 'react';
import { useModules } from '../../state/modules';
import { Badge, cx } from '../../ui';
import { bandMeta, BANDS, CLASS_NAME, CLASS_SHORT } from './bands';
import { bandOf, RESULT, SUBJECTS, TOTAL_CLASSIFICATION_MARKS, type BandId, type Classification, type ClassificationMark, type ClassKind, type Picks } from './classify';
import { subjectDisplay } from './subjects';
import { blankIndexes, holdingFloors, improvementPlan, NEXT_CLASS, resitOutlook, targetsForRemaining, type HoldingFloor, type TargetKind } from './whatif';

type HeroState = 'empty' | 'partial' | 'resit' | 'classified';
type NameOf = (index: number) => string;

const BAND_FLOOR_FOR: Record<TargetKind, string> = { first: 'first-class', upper: 'upper second-class', lower: 'lower second-class', third: 'third-class' };
const AVG_BAR: Partial<Record<TargetKind, number>> = { first: 65, upper: 56, lower: 47 };
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** Classification marks that come only from entered fields (v1 counts a blank as 0; we don't draw those). */
function shownMarks(result: Classification, blanks: number[]): ClassificationMark[] {
  const blank = new Set(blanks);
  return result.marks.filter((m) => !m.source.some((i) => blank.has(i)));
}

export interface ResultHeroProps {
  marks: string[];
  picks: Picks;
  result: Classification;
}

/**
 * The live result: the class set big, the average, what would change it, and the 18-cell chart.
 * data-hub="grades-result" (the chart is data-hub="grades-breakdown").
 */
export function ResultHero({ marks, picks, result }: ResultHeroProps) {
  const { getModule } = useModules();
  const blanks = blankIndexes(marks);
  const entered = 13 - blanks.length;
  const state: HeroState = entered === 0 ? 'empty' : blanks.length ? 'partial' : result.failed ? 'resit' : 'classified';
  const cells = state === 'empty' ? [] : shownMarks(result, blanks);
  const nameOf = useCallback<NameOf>((i) => {
    const subject = SUBJECTS[i];
    return subject ? subjectDisplay(subject, picks, getModule).name : '';
  }, [picks, getModule]);

  const kicker = 'Your classification';
  let big: string;
  let name: string;
  let body: ReactNode;
  if (state === 'empty') {
    big = 'Your result';
    name = 'appears here as you type';
    body = <EmptyBody />;
  } else if (state === 'partial') {
    big = `${entered} of 13`;
    name = 'marks entered so far';
    body = <Targets marks={marks} />;
  } else if (state === 'resit') {
    big = CLASS_SHORT.resit;
    name = RESULT.resit; // v1's sentence, verbatim
    body = <Resit marks={marks} result={result} nameOf={nameOf} />;
  } else {
    big = CLASS_SHORT[result.kind];
    name = CLASS_NAME[result.kind];
    body = <Classified marks={marks} result={result} nameOf={nameOf} />;
  }

  return (
    <section className={cx('grades-hero', `grades-hero--${state}`, state === 'classified' && `grades-hero--${result.kind}`)} data-hub="grades-result" aria-labelledby="grades-result-title">
      <div className="grades-hero__main">
        <p className="grades-hero__kicker">{kicker}</p>
        <h2 id="grades-result-title" className="grades-hero__title">
          <span className="grades-hero__big">{big}</span>
          <span className="grades-hero__name">{name}</span>
        </h2>
        {state === 'classified' || state === 'resit' ? (
          <p className="grades-hero__avg">
            Average classification mark <strong>{result.average.toFixed(2)}</strong>
          </p>
        ) : null}
        <div className="grades-hero__body">{body}</div>
        <p className="visually-hidden" aria-live="polite">
          {state === 'classified' ? `${CLASS_NAME[result.kind]}, average ${result.average.toFixed(2)}` : state === 'resit' ? RESULT.resit : ''}
        </p>
      </div>
      <Breakdown cells={cells} state={state} nameOf={nameOf} kind={result.kind} />
    </section>
  );
}

function EmptyBody() {
  return (
    <p className="grades-hero__lede">
      Type your module marks below. Year 1 counts as one average worth 2 classification marks, each Advanced Statistics module counts 1, and every other module counts 2: 18
      marks in all.
    </p>
  );
}

function Targets({ marks }: { marks: string[] }) {
  const targets = targetsForRemaining(marks);
  const blocked = targets.every((t) => t.mark == null);
  if (blocked) {
    return <p className="grades-hero__lede">A mark under 40 means a resit, whatever you score in the modules left. Pass it and the targets for each class show up here.</p>;
  }
  return (
    <div className="grades-targets">
      <p className="grades-targets__intro">To finish with each class, score at least this in every module left:</p>
      <table className="grades-targets__table">
        <tbody>
          {targets.map((t) => (
            <tr key={t.kind} className={cx(t.mark == null && 'is-out')}>
              <th scope="row">{CLASS_NAME[t.kind]}</th>
              <td>
                {t.mark == null ? (
                  <span className="grades-targets__out">Out of reach</span>
                ) : t.mark === 40 ? (
                  <span className="grades-targets__pass">
                    <strong>40</strong> a pass is enough
                  </span>
                ) : (
                  <strong>{t.mark}</strong>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Resit({ marks, result, nameOf }: { marks: string[]; result: Classification; nameOf: NameOf }) {
  const outlook = resitOutlook(marks);
  if (!outlook) return null;
  const modules = outlook.failing.filter((f) => SUBJECTS[f.index]?.year !== 1).map((f) => `${nameOf(f.index)} (${fmt(f.mark)})`);
  const yearOne = outlook.yearOneAverageFails && result.yearOneAverage != null ? [`your Year 1 average (${fmt(Number(result.yearOneAverage.toFixed(2)))})`] : [];
  const parts = [...yearOne, ...modules];
  const many = parts.length > 1;
  return (
    <div className="grades-hints">
      <p className="grades-hints__line">
        <strong>Under 40:</strong> {parts.join(', ')}.
      </p>
      <p className="grades-hints__line">
        Pass {many ? 'them' : 'it'} with 40 or more and this calculator gives <strong>{CLASS_NAME[outlook.outcome]}</strong>.
      </p>
    </div>
  );
}

function Classified({ marks, result, nameOf }: { marks: string[]; result: Classification; nameOf: NameOf }) {
  const b = result.breakdown;
  const atOrAbove: Record<TargetKind, number> = {
    first: b.firstClass,
    upper: b.firstClass + b.upperSecondClass,
    lower: b.firstClass + b.upperSecondClass + b.lowerSecondClass,
    third: b.firstClass + b.upperSecondClass + b.lowerSecondClass + b.thirdClass,
  };
  const k = result.kind;
  const avg = result.average.toFixed(2);
  const word = (c: TargetKind) => (c === 'first' ? 'first-class' : `${BAND_FLOOR_FOR[c]} or better`);
  const lines: ReactNode[] = [];
  const t = NEXT_CLASS[k];
  if (k === 'first') {
    // How safely the First is held.
    const n = atOrAbove.first;
    if (n >= 10)
      lines.push(
        <>
          You have <strong>{n} first-class marks</strong>
          {n > 10 ? `, ${n - 10} more than the 10 a First needs` : ', exactly the 10 a First needs'}.
        </>,
      );
    else
      lines.push(
        <>
          You have <strong>{n} first-class marks</strong> and an average of <strong>{avg}</strong>: with 8 or 9, a First needs an average of 65 or more.
        </>,
      );
  } else if (t && t !== 'third') {
    // What the next class asks for, in the calculator's own terms.
    lines.push(
      <>
        You have{' '}
        <strong>
          {atOrAbove[t]} {word(t)} marks
        </strong>
        . {CLASS_SHORT[t] === 'First' ? 'A First' : `A ${CLASS_SHORT[t]}`} needs 10, or 8 with an average of {AVG_BAR[t]} or more (yours is {avg}).
      </>,
    );
  } else if (k === 'none') {
    lines.push(<>A Third needs 10 classification marks of 40 or more.</>);
  }
  const plan = t ? improvementPlan(marks) : null;
  // A First: which modules it hangs on (dropping them under their floor would cost the class).
  let hold: { fragile: HoldingFloor[]; floor: number } | null = null;
  if (k === 'first') {
    const floors = holdingFloors(marks) ?? [];
    const fragile = floors.filter((f) => f.floor > 40).sort((a, c) => c.floor - a.floor || a.from - c.from);
    hold = { fragile, floor: Math.max(...floors.map((f) => f.floor)) };
  }
  return (
    <div className="grades-hints">
      {lines.map((l, i) => (
        <p key={i} className="grades-hints__line">
          {l}
        </p>
      ))}
      {hold ? (
        hold.fragile.length === 0 ? (
          <div className="grades-plan">
            <p className="grades-plan__title">
              <strong>Room to spare.</strong> Any one module could fall to {hold.floor} and this calculator would still give a First.
            </p>
          </div>
        ) : (
          <div className="grades-plan">
            <p className="grades-plan__title">
              To keep <strong>First Class Honours</strong>, hold {hold.fragile.length === 1 ? 'this module' : 'these modules'} at
            </p>
            <ul role="list" className="grades-plan__list">
              {hold.fragile.slice(0, 4).map((f) => (
                <li key={f.index}>
                  <span className="grades-plan__name">{nameOf(f.index)}</span>
                  <span className="grades-plan__move">
                    <strong>{f.floor}</strong> or more, now {fmt(f.from)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
      {plan ? (
        <div className="grades-plan">
          <p className="grades-plan__title">
            To reach <strong>{CLASS_NAME[plan.target]}</strong>
          </p>
          <ul role="list" className="grades-plan__list">
            {plan.changes.map((c) => (
              <li key={c.index}>
                <span className="grades-plan__name">{nameOf(c.index)}</span>
                <span className="grades-plan__move">
                  {fmt(c.from)} to <strong>{fmt(c.to)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The 18 classification marks as cells, best first, coloured by band (ordinal cobalt ramp), with the
 * rule thresholds (8 and 10 marks) drawn on the strip. The legend doubles as the table view.
 */
function Breakdown({ cells, state, nameOf, kind }: { cells: ClassificationMark[]; state: HeroState; nameOf: NameOf; kind: ClassKind }) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = [...cells].sort((a, b) => b.value - a.value);
  const total = Math.max(TOTAL_CLASSIFICATION_MARKS, sorted.length);
  const pending = total - sorted.length;
  const counts: Record<BandId, number> = { first: 0, upper: 0, lower: 0, third: 0, fail: 0 };
  sorted.forEach((c) => {
    counts[bandOf(c.value)] += 1;
  });
  const GAP = 4;
  const at = (k: number) => `calc(${k} * ((100% - ${(total - 1) * GAP}px) / ${total} + ${GAP}px) - ${GAP / 2}px)`;
  const describe = (c: ClassificationMark) => {
    const first = c.source[0] ?? 0;
    const src = c.source.length === 4 ? 'Year 1 average' : nameOf(first);
    const weight = c.source.length === 4 ? 2 : (SUBJECTS[first]?.weight ?? 2);
    return `${src}: ${fmt(Number(c.value.toFixed(2)))}, ${bandMeta(bandOf(c.value)).label.toLowerCase()}, ${weight === 1 ? '1 mark' : `${weight} marks`}`;
  };
  const hovered = hover != null ? sorted[hover] : undefined;

  return (
    <figure className="grades-chart" data-hub="grades-breakdown" aria-labelledby="grades-chart-title">
      <figcaption id="grades-chart-title" className="grades-chart__title">
        Classification marks
        <span className="grades-chart__sub">{state === 'empty' ? `${total} in all` : `${sorted.length} of ${total} counted`}</span>
      </figcaption>
      <div className="grades-chart__plot">
        <div className="grades-chart__cells" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`, gap: GAP }} aria-hidden="true" onMouseLeave={() => setHover(null)}>
          {sorted.map((c, i) => (
            <span key={i} className={cx('grades-cell', `grades-cell--${bandOf(c.value)}`, hover === i && 'is-hover')} onMouseEnter={() => setHover(i)} />
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <span key={`p${i}`} className="grades-cell grades-cell--pending" />
          ))}
        </div>
        {[8, 10].map((k) => (
          <span key={k} className={cx('grades-chart__rule', k === 10 && 'is-ten')} style={{ left: at(k) }} aria-hidden="true">
            <span className="grades-chart__rule-label">{k}</span>
          </span>
        ))}
        {hover != null && hovered ? (
          <span className="grades-chart__tip" style={{ left: `calc(${at(hover + 0.5)} + ${GAP / 2}px)` }} role="presentation">
            {describe(hovered)}
          </span>
        ) : null}
      </div>
      <p className="grades-chart__rulecap">
        A class needs <strong>10</strong> marks in its band or better, or <strong>8</strong> with a high enough average.
      </p>
      <table className="grades-legend">
        <caption className="visually-hidden">Classification marks per band</caption>
        <tbody>
          {BANDS.filter((band) => band.id !== 'fail' || counts.fail > 0).map((band) => (
            <tr key={band.id}>
              <th scope="row">
                <span className={cx('grades-swatch', `grades-cell--${band.id}`)} aria-hidden="true" />
                {band.label}
                <span className="grades-legend__range">{band.range}</span>
                {state === 'classified' && kind === band.id ? (
                  <Badge tone="highlight" size="sm" className="grades-legend__tag">
                    Decides your class
                  </Badge>
                ) : null}
              </th>
              <td>{counts[band.id]}</td>
            </tr>
          ))}
          {pending > 0 ? (
            <tr className="is-pending">
              <th scope="row">
                <span className="grades-swatch grades-cell--pending" aria-hidden="true" />
                Not entered yet
              </th>
              <td>{pending}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </figure>
  );
}
