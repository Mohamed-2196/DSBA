import type { ReactNode } from 'react';
import type { FormulaData, MathPart, Step } from './types';

/** A run of maths from the brain (plain data, see types.ts) set properly. */
function Maths({ parts }: { parts: readonly MathPart[] }) {
  return (
    <>
      {parts.map((part, i): ReactNode => {
        if (typeof part === 'string') return part;
        if ('int' in part) {
          return (
            <span key={i} className="nc-int">
              <span className="nc-int__sign">∫</span>
              <span className="nc-int__limits">
                <span>{part.int[1]}</span>
                <span>{part.int[0]}</span>
              </span>
            </span>
          );
        }
        if ('big' in part) {
          return (
            <span key={i} className="nc-big">
              {part.big}
            </span>
          );
        }
        if ('top' in part) {
          return (
            <span key={i} className="nc-frac">
              <span className="nc-frac__top">
                <Maths parts={part.top} />
              </span>
              <span className="nc-frac__bottom">
                <Maths parts={part.bottom} />
              </span>
            </span>
          );
        }
        return (
          <span key={i}>
            <i>{part.v}</i>
            {part.sub ? (
              <sub>
                <Maths parts={part.sub} />
              </sub>
            ) : null}
            {part.sup ? (
              <sup>
                <Maths parts={part.sup} />
              </sup>
            ) : null}
          </span>
        );
      })}
    </>
  );
}

/** The formula card inside one of her answers. Screen readers get the formula as a sentence (`say`). */
export function Formula({ formula }: { formula: FormulaData }) {
  return (
    <div className="nc-formula" role="img" aria-label={formula.say}>
      <p className="nc-formula__line" aria-hidden="true">
        <Maths parts={formula.line} />
      </p>
      {formula.note ? (
        <p className="nc-formula__note" aria-hidden="true">
          <Maths parts={formula.note} />
        </p>
      ) : null}
    </div>
  );
}

/** A worked solution: one numbered card per step, a line of words over a line of maths; the last is the result. */
export function Steps({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="nc-steps" role="list">
      {steps.map((step, i) => (
        <li key={i} className={step.result ? 'nc-step nc-step--result' : 'nc-step'}>
          <p className="nc-step__label">
            <b aria-hidden="true">{i + 1}</b>
            <span>
              <Maths parts={step.label} />
            </span>
          </p>
          <p className="nc-step__line" role="img" aria-label={step.say}>
            <span aria-hidden="true">
              <Maths parts={step.line} />
            </span>
          </p>
        </li>
      ))}
    </ol>
  );
}
