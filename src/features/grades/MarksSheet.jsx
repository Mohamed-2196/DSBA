import { useEffect, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { cohortColor } from '../../state';
import { cx } from '../../ui';
import { bandOf, gradeDescription } from './classify.js';
import { BANDS } from './bands.js';
import { choiceOptions, subjectDisplay, YEARS } from './subjects.js';

const YEAR_RULE = {
  1: 'Averaged together. The average counts as 2 of your 18 classification marks.',
  2: 'Each Advanced Statistics module counts 1 mark, the others 2 each: 8 marks.',
  3: 'Each module counts 2 marks: 8 marks.',
};

/** '' or a mark from 0 to 100 with up to 2 decimals; null = reject the keystroke. */
function sanitize(value) {
  const t = value.replace(',', '.').replace(/\s+/g, '');
  if (t === '') return '';
  if (!/^\d{0,3}(\.\d{0,2})?$/.test(t)) return null;
  if (Number(t) > 100) return null;
  return t;
}

/**
 * The marks form: three year columns in one sheet. Enter moves to the next field, ↑/↓ nudge a mark
 * by 1 (Shift: 5), so "what if I got 3 more?" is a keystroke away. data-hub="grades-inputs".
 * @param {string[]} marks       13 raw values in v1 order
 * @param {object} picks         { year2Option, elective1, elective2 }
 * @param {Map<number, number>} aims  subject index → mark suggested by the what-if plan
 */
export function MarksSheet({ marks, picks, yearOneAverage, aims, onMark, onPick }) {
  const inputs = useRef([]);
  const [rejected, setRejected] = useState(null);

  useEffect(() => {
    if (rejected == null) return undefined;
    const t = setTimeout(() => setRejected(null), 1800);
    return () => clearTimeout(t);
  }, [rejected]);

  const change = (i, raw) => {
    const v = sanitize(raw);
    if (v === null) {
      setRejected(i);
      return;
    }
    if (rejected === i) setRejected(null);
    onMark(i, v);
  };

  const onKeyDown = (e, i) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = inputs.current[i + 1];
      if (next) next.focus();
      else e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1);
      const cur = marks[i] === '' ? 0 : Number(marks[i]);
      const next = Math.max(0, Math.min(100, Math.round(cur) + step));
      onMark(i, String(next));
    }
  };

  const y1Entered = marks.slice(0, 4).filter((m) => m !== '').length;
  const y1SingleFail = marks.slice(0, 4).some((m) => m !== '' && Number(m) < 40) && yearOneAverage != null && yearOneAverage >= 40;

  return (
    <section className="grades-sheet" data-hub="grades-inputs" aria-labelledby="grades-sheet-title">
      <h2 id="grades-sheet-title" className="visually-hidden">Your module marks</h2>
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
              const d = subjectDisplay(s, picks);
              const raw = marks[i];
              const has = raw !== '';
              const band = has ? bandOf(Number(raw)) : null;
              const bandMeta = band ? BANDS.find((b) => b.id === band) : null;
              const id = `grades-mark-${i}`;
              const aim = aims?.get(i);
              return (
                <li key={i} className={cx('grades-row', has && 'has-mark', aim != null && 'has-aim')}>
                  <div className="grades-row__label">
                    <span className="grades-row__code-line">
                      {d.code ? <span className="grades-row__code u-code">{d.code}</span> : null}
                      {year === 2 ? <span className="grades-row__weight">{s.weight === 1 ? '1 mark' : '2 marks'}</span> : null}
                    </span>
                    {s.choice ? (
                      <span className={cx('grades-choice', d.placeholder && 'is-placeholder')}>
                        <select
                          className="grades-choice__select"
                          value={picks[s.choice] || ''}
                          onChange={(e) => onPick(s.choice, e.target.value || undefined)}
                          aria-label={s.choice === 'year2Option' ? 'Your Year 2 option module' : `Your ${d.placeholder ? d.name.toLowerCase() : 'elective'} module`}
                        >
                          <option value="">{s.choice === 'year2Option' ? 'Choose your Year 2 option' : `Choose ${d.placeholder ? d.name.toLowerCase() : 'an elective'}`}</option>
                          {choiceOptions(s.choice, picks).map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <CaretDown className="grades-choice__caret" aria-hidden="true" weight="bold" />
                      </span>
                    ) : (
                      <label htmlFor={id} className="grades-row__name">{d.name}</label>
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
                    aria-label={s.choice ? `${d.name} mark` : undefined}
                    aria-describedby={`${id}-band`}
                    onChange={(e) => change(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                  />
                  <span id={`${id}-band`} className="grades-row__band" aria-live="off">
                    {rejected === i ? (
                      <span className="grades-row__error">0 to 100</span>
                    ) : bandMeta ? (
                      <>
                        <span className={cx('grades-swatch', `grades-cell--${band}`)} aria-hidden="true" />
                        <span aria-hidden="true">{bandMeta.short}</span>
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
                  <span>{BANDS.find((b) => b.id === bandOf(yearOneAverage)).short}, counted twice</span>
                </>
              ) : (
                <>Enter all four marks to see your Year 1 average.</>
              )}
            </p>
          ) : null}
          {year === 1 && y1SingleFail ? (
            <p className="grades-year__note">This calculator only checks Year 1 through its average, which is 40 or more.</p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
