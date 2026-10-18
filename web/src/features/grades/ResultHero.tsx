import { useCallback, useState, type ReactNode } from 'react';
import { useModules } from '../../state/modules';
import { Badge, cx } from '../../ui';
import { bandMeta, bandsOf, CLASS_NAME, CLASS_SHORT } from './bands';
import {
  bandOf,
  pooledIndexes,
  RESULT,
  subjectsOf,
  totalMarks,
  type BandId,
  type Classification,
  type ClassificationMark,
  type ClassKind,
  type Picks,
  type Rules,
} from './classify';
import { countsSentence, countsSummary } from './rulesText';
import { subjectDisplay } from './subjects';
import {
  blankIndexes,
  holdingFloors,
  improvementPlan,
  NEXT_CLASS,
  resitOutlook,
  targetsForRemaining,
  type HoldingFloor,
  type TargetKind,
} from './whatif';

type HeroState = 'empty' | 'partial' | 'resit' | 'classified';
type NameOf = (index: number) => string;

const BAND_FLOOR_FOR: Record<TargetKind, string> = {
  first: 'first-class',
  upper: 'upper second-class',
  lower: 'lower second-class',
  third: 'third-class',
};
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** Classification marks that come only from entered fields (classify() counts a blank as 0; those aren't drawn). */
function shownMarks(result: Classification, blanks: number[]): ClassificationMark[] {
  const blank = new Set(blanks);
  return result.marks.filter((m) => !m.source.some((i) => blank.has(i)));
}

export interface ResultHeroProps {
  marks: string[];
  picks: Picks;
  result: Classification;
  rules: Rules;
}

/**
 * The live result: the class set big, the average, what would change it, and a cell for each classification mark.
 * data-hub="grades-result" (the chart is data-hub="grades-breakdown").
 */
export function ResultHero({ marks, picks, result, rules }: ResultHeroProps) {
  const { getModule } = useModules();
  const blanks = blankIndexes(marks, rules);
  const count = rules.subjects.length;
  const entered = count - blanks.length;
  const state: HeroState = entered === 0 ? 'empty' : blanks.length ? 'partial' : result.failed ? 'resit' : 'classified';
  const cells = state === 'empty' ? [] : shownMarks(result, blanks);
  const nameOf = useCallback<NameOf>(
    (i) => {
      const subject = subjectsOf(rules)[i];
      return subject ? subjectDisplay(subject, picks, getModule, rules).name : '';
    },
    [picks, getModule, rules],
  );
  const summary = countsSummary(rules, (s) => {
    const d = subjectDisplay(s, picks, getModule, rules);
    return d.code ?? d.short;
  });

  const kicker = 'Your classification';
  let big: string;
  let name: string;
  let body: ReactNode;
  if (state === 'empty') {
    big = 'Type a mark';
    name = 'to see your class';
    body = <p className="grades-hero__lede">{`Type your module marks below. ${countsSentence(summary)}`}</p>;
  } else if (state === 'partial') {
    big = `${entered} of ${count}`;
    name = 'marks entered so far';
    body = <Targets marks={marks} rules={rules} />;
  } else if (state === 'resit') {
    big = CLASS_SHORT.resit;
    name = RESULT.resit; // the result string, as classify() gives it
    body = <Resit marks={marks} result={result} nameOf={nameOf} rules={rules} label={summary.pooled?.label ?? null} />;
  } else {
    big = CLASS_SHORT[result.kind];
    name = CLASS_NAME[result.kind];
    body = <Classified marks={marks} result={result} nameOf={nameOf} rules={rules} />;
  }

  return (
    <section
      className={cx('grades-hero', `grades-hero--${state}`, state === 'classified' && `grades-hero--${result.kind}`)}
      data-hub="grades-result"
      aria-labelledby="grades-result-title"
    >
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
          {state === 'classified'
            ? `${CLASS_NAME[result.kind]}, average ${result.average.toFixed(2)}`
            : state === 'resit'
              ? RESULT.resit
              : ''}
        </p>
      </div>
      {state !== 'empty' ? (
        <Breakdown
          cells={cells}
          state={state}
          nameOf={nameOf}
          kind={result.kind}
          rules={rules}
          pooledLabel={summary.pooled?.label ?? null}
        />
      ) : null}
    </section>
  );
}

function Targets({ marks, rules }: { marks: string[]; rules: Rules }) {
  const targets = targetsForRemaining(marks, rules);
  const blocked = targets.every((t) => t.mark == null);
  const pass = rules.bands.third.floor;
  if (blocked) {
    return (
      <p className="grades-hero__lede">{`A mark under ${pass} means a resit, whatever you score in the modules left. Pass it and the targets for each class show up here.`}</p>
    );
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
                ) : t.mark === pass ? (
                  <span className="grades-targets__pass">
                    <strong>{pass}</strong> a pass is enough
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

function Resit({
  marks,
  result,
  nameOf,
  rules,
  label,
}: {
  marks: string[];
  result: Classification;
  nameOf: NameOf;
  rules: Rules;
  label: string | null;
}) {
  const outlook = resitOutlook(marks, rules);
  if (!outlook) return null;
  const pass = rules.bands.third.floor;
  const modules = outlook.failing
    .filter((f) => rules.subjects[f.index]?.counts !== 'average')
    .map((f) => `${nameOf(f.index)} (${fmt(f.mark)})`);
  const pooled =
    outlook.groupAverageFails && result.groupAverage != null
      ? [`your ${label ?? 'averaged modules’'} average (${fmt(Number(result.groupAverage.toFixed(2)))})`]
      : [];
  const parts = [...pooled, ...modules];
  const many = parts.length > 1;
  return (
    <div className="grades-hints">
      <p className="grades-hints__line">
        <strong>Under {pass}:</strong> {parts.join(', ')}.
      </p>
      <p className="grades-hints__line">
        Pass {many ? 'them' : 'it'} with {pass} or more and this calculator gives{' '}
        <strong>{CLASS_NAME[outlook.outcome]}</strong>.
      </p>
    </div>
  );
}

function Classified({
  marks,
  result,
  nameOf,
  rules,
}: {
  marks: string[];
  result: Classification;
  nameOf: NameOf;
  rules: Rules;
}) {
  const { needed, fewer, averages } = rules;
  const bar: Partial<Record<TargetKind, number>> = averages;
  const pass = rules.bands.third.floor;
  const between = fewer === needed - 1 ? `${fewer}` : `${fewer} to ${needed - 1}`;
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
    if (n >= needed)
      lines.push(
        <>
          You have <strong>{n} first-class marks</strong>
          {n > needed
            ? `, ${n - needed} more than the ${needed} a First needs`
            : `, exactly the ${needed} a First needs`}
          .
        </>,
      );
    else
      lines.push(
        <>
          You have <strong>{n} first-class marks</strong> and an average of <strong>{avg}</strong>: with {between}, a
          First needs an average of {averages.first} or more.
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
        . {CLASS_SHORT[t] === 'First' ? 'A First' : `A ${CLASS_SHORT[t]}`} needs {needed}, or {fewer} with an average of{' '}
        {bar[t]} or more (yours is {avg}).
      </>,
    );
  } else if (k === 'none') {
    lines.push(
      <>
        A Third needs {needed} classification marks of {pass} or more.
      </>,
    );
  }
  const plan = t ? improvementPlan(marks, rules) : null;
  // A First: which modules it hangs on (dropping them under their floor would cost the class).
  let hold: { fragile: HoldingFloor[]; floor: number } | null = null;
  if (k === 'first') {
    const floors = holdingFloors(marks, rules) ?? [];
    const fragile = floors.filter((f) => f.floor > pass).sort((a, c) => c.floor - a.floor || a.from - c.from);
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
              <strong>Room to spare.</strong> Any one module could fall to {hold.floor} and this calculator would still
              give a First.
            </p>
          </div>
        ) : (
          <div className="grades-plan">
            <p className="grades-plan__title">
              To keep <strong>First Class Honours</strong>, hold{' '}
              {hold.fragile.length === 1 ? 'this module' : 'these modules'} at
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
 * The classification marks as cells, best first, coloured by band (ordinal cobalt ramp), with the
 * rule thresholds (rules.fewer and rules.needed marks) drawn on the strip. The legend doubles as the table view.
 */
function Breakdown({
  cells,
  state,
  nameOf,
  kind,
  rules,
  pooledLabel,
}: {
  cells: ClassificationMark[];
  state: HeroState;
  nameOf: NameOf;
  kind: ClassKind;
  rules: Rules;
  pooledLabel: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = [...cells].sort((a, b) => b.value - a.value);
  const total = Math.max(totalMarks(rules), sorted.length);
  const pending = total - sorted.length;
  const counts: Record<BandId, number> = { first: 0, upper: 0, lower: 0, third: 0, fail: 0 };
  sorted.forEach((c) => {
    counts[bandOf(c.value, rules)] += 1;
  });
  const pooledCount = pooledIndexes(rules).length;
  const GAP = 4;
  const at = (k: number) => `calc(${k} * ((100% - ${(total - 1) * GAP}px) / ${total} + ${GAP}px) - ${GAP / 2}px)`;
  const describe = (c: ClassificationMark) => {
    const first = c.source[0] ?? 0;
    const pooled = pooledCount > 0 && c.source.length === pooledCount && rules.subjects[first]?.counts === 'average';
    const src = pooled ? `${pooledLabel ?? 'Averaged modules’'} average` : nameOf(first);
    const counted = rules.subjects[first]?.counts;
    const weight = pooled ? rules.averageCounts : typeof counted === 'number' ? counted : 1;
    return `${src}: ${fmt(Number(c.value.toFixed(2)))}, ${bandMeta(bandOf(c.value, rules), rules).label.toLowerCase()}, ${weight === 1 ? '1 mark' : `${weight} marks`}`;
  };
  const hovered = hover != null ? sorted[hover] : undefined;

  return (
    <figure className="grades-chart" data-hub="grades-breakdown" aria-labelledby="grades-chart-title">
      <figcaption id="grades-chart-title" className="grades-chart__title">
        Classification marks
        <span className="grades-chart__sub">
          {state === 'empty' ? `${total} in all` : `${sorted.length} of ${total} counted`}
        </span>
      </figcaption>
      <div className="grades-chart__plot">
        <div
          className="grades-chart__cells"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`, gap: GAP }}
          aria-hidden="true"
          onMouseLeave={() => setHover(null)}
        >
          {sorted.map((c, i) => (
            <span
              key={i}
              className={cx('grades-cell', `grades-cell--${bandOf(c.value, rules)}`, hover === i && 'is-hover')}
              onMouseEnter={() => setHover(i)}
            />
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <span key={`p${i}`} className="grades-cell grades-cell--pending" />
          ))}
        </div>
        {[...new Set([rules.fewer, rules.needed])].map((k) => (
          <span
            key={k}
            className={cx('grades-chart__rule', k === rules.needed && 'is-ten')}
            style={{ left: at(k) }}
            aria-hidden="true"
          >
            <span className="grades-chart__rule-label">{k}</span>
          </span>
        ))}
        {hover != null && hovered ? (
          <span
            className="grades-chart__tip"
            style={{ left: `calc(${at(hover + 0.5)} + ${GAP / 2}px)` }}
            role="presentation"
          >
            {describe(hovered)}
          </span>
        ) : null}
      </div>
      <p className="grades-chart__rulecap">
        A class needs <strong>{rules.needed}</strong> marks in its band or better, or <strong>{rules.fewer}</strong>{' '}
        with a high enough average.
      </p>
      <table className="grades-legend">
        <caption className="visually-hidden">Classification marks per band</caption>
        <tbody>
          {bandsOf(rules)
            .filter((band) => band.id !== 'fail' || counts.fail > 0)
            .map((band) => (
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
