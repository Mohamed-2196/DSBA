import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { cohortColor } from '../../state';
import { useModules } from '../../state/modules';
import { cx } from '../../ui';
import { bandMeta } from './bands';
import { bandOf, gradeDescription, type ChoiceSlot, type Picks } from './classify';
import { choiceOptions, subjectDisplay, YEARS } from './subjects';

const YEAR_RULE: Record<1 | 2 | 3, string> = {
  1: 'Averaged together. The average counts as 2 of your 18 classification marks.',
  2: 'Each Advanced Statistics module counts 1 mark, the others 2 each: 8 marks.',
  3: 'Each module counts 2 marks: 8 marks.',
};

/** '' or a mark from 0 to 100 with up to 2 decimals; null = reject the keystroke. */
function sanitize(value: string): string | null {
  const t = value.replace(',', '.').replace(/\s+/g, '');
  if (t === '') return '';
  if (!/^\d{0,3}(\.\d{0,2})?$/.test(t)) return null;
  if (Number(t) > 100) return null;
  return t;
}

export interface MarksSheetProps {
  /** 13 raw values in v1 order */
  marks: string[];
  picks: Picks;
  yearOneAverage: number | null;
  /** subject index → mark suggested by the what-if plan */
  aims: Map<number, number>;
  onMark: (index: number, value: string) => void;
  onPick: (choice: ChoiceSlot, value: string | undefined) => void;
}

/**
 * The marks form: three year columns in one sheet. Enter moves to the next field, ↑/↓ nudge a mark
 * by 1 (Shift: 5), so "what if I got 3 more?" is a keystroke away. data-hub="grades-inputs".
 */
export function MarksSheet({ marks, picks, yearOneAverage, aims, onMark, onPick }: MarksSheetProps) {
  const { getModule } = useModules();
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

  const y1Entered = marks.slice(0, 4).filter((m) => m !== '').length;
  const y1SingleFail = marks.slice(0, 4).some((m) => m !== '' && Number(m) < 40) && yearOneAverage != null && yearOneAverage >= 40;

  return (
    <section className="grades-sheet" data-hub="grades-inputs" aria-labelledby="grades-sheet-title">
      <h2 id="grades-sheet-title" className="visually-hidden">
        Your module marks
      </h2>
      {YEARS.map(({ year, subjects }) => (
        <div key={year} className="grades-year" role="group" aria-labelledby={`grades-y${year}`}>
          <header className="grades-year__head">
            <h3 id={`grades-y${year}`} className="grades-year__title">
              <span className="grades-year__dot" style={{ background: cohortColor(year) }} aria-hidden="true" />
              Year {year}
            </h3>
            <p className="grades-year__rule">{YEAR_RULE[year]}</p>
          </header>
          <ol role="list" className="grades-year__rows">
            {subjects.map((s) => {
              const i = s.index;
              const d = subjectDisplay(s, picks, getModule);
              const raw = marks[i] ?? '';
              const has = raw !== '';
              const band = has ? bandOf(Number(raw)) : null;
              const meta = band ? bandMeta(band) : null;
              const id = `grades-mark-${i}`;
              const aim = aims.get(i);
              const choice = s.choice;
              return (
                <li key={i} className={cx('grades-row', has && 'has-mark', aim != null && 'has-aim')}>
                  <div className="grades-row__label">
                    <span className="grades-row__code-line">
                      {d.code ? <span className="grades-row__code u-code">{d.code}</span> : null}
                      {year === 2 ? <span className="grades-row__weight">{s.weight === 1 ? '1 mark' : '2 marks'}</span> : null}
                    </span>
                    {choice ? (
                      <span className={cx('grades-choice', d.placeholder && 'is-placeholder')}>
                        <select
                          className="grades-choice__select"
                          value={picks[choice] ?? ''}
                          onChange={(e) => onPick(choice, e.target.value || undefined)}
                          aria-label={choice === 'year2Option' ? 'Your Year 2 option module' : `Your ${d.placeholder ? d.name.toLowerCase() : 'elective'} module`}
                        >
                          <option value="">{choice === 'year2Option' ? 'Choose your Year 2 option' : `Choose ${d.placeholder ? d.name.toLowerCase() : 'an elective'}`}</option>
                          {choiceOptions(choice, picks, getModule).map((o) => (
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
                        <span className="visually-hidden">{gradeDescription(Number(raw))}</span>
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
          {year === 1 ? (
            <p className="grades-year__foot">
              {yearOneAverage != null && y1Entered === 4 ? (
                <>
                  Year 1 average <strong className="u-tabular">{yearOneAverage.toFixed(2)}</strong>
                  <span className={cx('grades-swatch', `grades-cell--${bandOf(yearOneAverage)}`)} aria-hidden="true" />
                  <span>{bandMeta(bandOf(yearOneAverage)).short}, counted twice</span>
                </>
              ) : (
                <>Enter all four marks to see your Year 1 average.</>
              )}
            </p>
          ) : null}
          {year === 1 && y1SingleFail ? <p className="grades-year__note">This calculator only checks Year 1 through its average, which is 40 or more.</p> : null}
        </div>
      ))}
    </section>
  );
}
