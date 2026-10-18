import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { cohortColor } from '../../state';
import { useModules } from '../../state/modules';
import { cx } from '../../ui';
import { bandMeta } from './bands';
import {
  bandOf,
  gradeDescription,
  pooledIndexes,
  totalMarks,
  type ChoiceSlot,
  type Picks,
  type Rules,
  type Subject,
} from './classify';
import { listed } from './rulesText';
import { choiceOptions, subjectDisplay, yearsOf } from './subjects';

const marksWord = (n: number) => `${n} ${n === 1 ? 'mark' : 'marks'}`;
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** What a year's modules count, in a line under its title. Tags show on its rows when they count differently. */
function yearRule(subjects: Subject[], rules: Rules, codeOf: (s: Subject) => string): { text: string; tags: boolean } {
  const counted = subjects.flatMap((s) => (s.counts === 'average' ? [] : [{ s, counts: s.counts }]));
  if (counted.length === 0)
    return {
      text: `Averaged together. The average counts as ${rules.averageCounts} of your ${totalMarks(rules)} classification marks.`,
      tags: false,
    };
  const sum = counted.reduce((n, c) => n + c.counts, 0);
  const averaged = counted.length < subjects.length ? ' The others count through their average.' : '';
  const kinds = [...new Set(counted.map((c) => c.counts))];
  if (kinds.length === 1)
    return {
      text: `Each ${averaged ? 'other ' : ''}module counts ${marksWord(kinds[0] ?? 0)}: ${sum} marks.${averaged}`,
      tags: false,
    };
  // The count most of them have is "the others"; the rest are named.
  const usual =
    kinds.sort(
      (a, b) => counted.filter((c) => c.counts === b).length - counted.filter((c) => c.counts === a).length || b - a,
    )[0] ?? 2;
  const named = kinds
    .filter((k) => k !== usual)
    .map((k) => {
      const these = counted.filter((c) => c.counts === k).map((c) => codeOf(c.s));
      return `${listed(these)} ${these.length === 1 ? 'counts' : 'each count'} ${marksWord(k)}`;
    });
  return { text: `${named.join('; ')}, the others ${usual} each: ${sum} marks.${averaged}`, tags: true };
}

/** '' or a mark from 0 to 100 with up to 2 decimals; null = reject the keystroke. */
function sanitize(value: string): string | null {
  const t = value.replace(',', '.').replace(/\s+/g, '');
  if (t === '') return '';
  if (!/^\d{0,3}(\.\d{0,2})?$/.test(t)) return null;
  if (Number(t) > 100) return null;
  return t;
}

export interface MarksSheetProps {
  /** one raw value per subject, in the rules' order */
  marks: string[];
  picks: Picks;
  /** the average of the subjects counted through it (classify()'s groupAverage) */
  groupAverage: number | null;
  /** subject index → mark suggested by the what-if plan */
  aims: Map<number, number>;
  onMark: (index: number, value: string) => void;
  onPick: (choice: ChoiceSlot, value: string | undefined) => void;
  rules: Rules;
}

/**
 * The marks form: three year columns in one sheet. Enter moves to the next field, ↑/↓ nudge a mark
 * by 1 (Shift: 5), so "what if I got 3 more?" is a keystroke away. data-hub="grades-inputs".
 */
export function MarksSheet({ marks, picks, groupAverage, aims, onMark, onPick, rules }: MarksSheetProps) {
  const { getModule } = useModules();
  const codeOf = (s: Subject) => {
    const d = subjectDisplay(s, picks, getModule, rules);
    return d.code ?? d.short;
  };
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [rejected, setRejected] = useState<number | null>(null);

  useEffect(() => {
    if (rejected == null) return undefined;
    const t = setTimeout(() => setRejected(null), 1800);
    return () => clearTimeout(t);
  }, [rejected]);

  const change = (i: number, raw: string) => {
    const v = sanitize(raw);
    if (v === null) {
      setRejected(i);
      return;
    }
    if (rejected === i) setRejected(null);
    onMark(i, v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = inputs.current[i + 1];
      if (next) next.focus();
      else e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1);
      const raw = marks[i] ?? '';
      const cur = raw === '' ? 0 : Number(raw);
      const next = Math.max(0, Math.min(100, Math.round(cur) + step));
      onMark(i, String(next));
    }
  };

  const pass = rules.bands.third.floor;
  const pooled = pooledIndexes(rules);
  const pooledYears = new Set(pooled.map((i) => rules.subjects[i]?.year));
  const footYear = rules.subjects[pooled[0] ?? -1]?.year ?? null;
  const pooledLabel = pooledYears.size === 1 && footYear ? `Year ${footYear}` : 'Averaged modules’';
  const pooledEntered = pooled.filter((i) => (marks[i] ?? '') !== '').length;
  const pooledSingleFail =
    pooled.some((i) => (marks[i] ?? '') !== '' && Number(marks[i]) < pass) &&
    groupAverage != null &&
    groupAverage >= pass;

  return (
    <section className="grades-sheet" data-hub="grades-inputs" aria-labelledby="grades-sheet-title">
      <h2 id="grades-sheet-title" className="visually-hidden">
        Your module marks
      </h2>
      {yearsOf(rules).map(({ year, subjects }) => {
        const rule = yearRule(subjects, rules, codeOf);
        return (
          <div key={year} className="grades-year" role="group" aria-labelledby={`grades-y${year}`}>
            <header className="grades-year__head">
              <h3 id={`grades-y${year}`} className="grades-year__title">
                <span className="grades-year__dot" style={{ background: cohortColor(year) }} aria-hidden="true" />
                Year {year}
              </h3>
              <p className="grades-year__rule">{rule.text}</p>
            </header>
            <ol role="list" className="grades-year__rows">
              {subjects.map((s) => {
                const i = s.index;
                const d = subjectDisplay(s, picks, getModule, rules);
                const raw = marks[i] ?? '';
                const has = raw !== '';
                const band = has ? bandOf(Number(raw), rules) : null;
                const meta = band ? bandMeta(band, rules) : null;
                const id = `grades-mark-${i}`;
                const aim = aims.get(i);
                const choice = s.choice;
                return (
                  <li key={i} className={cx('grades-row', has && 'has-mark', aim != null && 'has-aim')}>
                    <div className="grades-row__label">
                      <span className="grades-row__code-line">
                        {d.code ? <span className="grades-row__code u-code">{d.code}</span> : null}
                        {rule.tags && s.counts !== 'average' ? (
                          <span className="grades-row__weight">{marksWord(s.counts)}</span>
                        ) : null}
                      </span>
                      {choice ? (
                        <span className={cx('grades-choice', d.placeholder && 'is-placeholder')}>
                          <select
                            className="grades-choice__select"
                            value={picks[choice] ?? ''}
                            onChange={(e) => onPick(choice, e.target.value || undefined)}
                            aria-label={
                              choice === 'year2Option'
                                ? 'Your Year 2 option module'
                                : `Your ${d.placeholder ? d.name.toLowerCase() : 'elective'} module`
                            }
                          >
                            <option value="">
                              {choice === 'year2Option'
                                ? 'Choose your Year 2 option'
                                : `Choose ${d.placeholder ? d.name.toLowerCase() : 'an elective'}`}
                            </option>
                            {choiceOptions(choice, picks, getModule, rules).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <CaretDown className="grades-choice__caret" aria-hidden="true" weight="bold" />
                        </span>
                      ) : (
                        <label htmlFor={id} className="grades-row__name">
                          {d.name}
                        </label>
                      )}
                    </div>
                    <input
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      id={id}
                      className={cx('grades-row__input', rejected === i && 'is-rejected')}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="–"
                      value={raw}
                      aria-label={choice ? `${d.name} mark` : undefined}
                      aria-describedby={`${id}-band`}
                      onChange={(e) => change(i, e.target.value)}
                      onKeyDown={(e) => onKeyDown(e, i)}
                    />
                    <span id={`${id}-band`} className="grades-row__band" aria-live="off">
                      {rejected === i ? (
                        <span className="grades-row__error">0 to 100</span>
                      ) : meta ? (
                        <>
                          <span className={cx('grades-swatch', `grades-cell--${meta.id}`)} aria-hidden="true" />
                          <span aria-hidden="true">{meta.short}</span>
                          <span className="visually-hidden">{gradeDescription(Number(raw), rules)}</span>
                        </>
                      ) : null}
                    </span>
                    {aim != null ? (
                      <span className="grades-row__aim">
                        Aim for <strong>{aim}</strong>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {year === footYear ? (
              <p className="grades-year__foot">
                {groupAverage != null && pooledEntered === pooled.length ? (
                  <>
                    {pooledLabel} average <strong className="u-tabular">{groupAverage.toFixed(2)}</strong>
                    <span
                      className={cx('grades-swatch', `grades-cell--${bandOf(groupAverage, rules)}`)}
                      aria-hidden="true"
                    />
                    <span>
                      {bandMeta(bandOf(groupAverage, rules), rules).short}, counted {times(rules.averageCounts)}
                    </span>
                  </>
                ) : (
                  <>{`Enter all ${pooled.length} marks to see your ${pooledLabel} average.`}</>
                )}
              </p>
            ) : null}
            {year === footYear && pooledSingleFail ? (
              <p className="grades-year__note">{`This calculator only checks ${pooledLabel} through its average, which is ${pass} or more.`}</p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
