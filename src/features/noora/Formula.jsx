/**
 * A run of maths from the brain (plain data, see brain.js) set properly:
 *   'text'            upright, as written
 *   { v, sub? }       a variable in italics, with a real subscript
 *   { top, bottom }   a stacked fraction
 */
function Maths({ parts }) {
  return parts.map((part, i) => {
    if (typeof part === 'string') return part;
    if (part.top) {
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
      </span>
    );
  });
}

/** The formula card inside one of her answers. Screen readers get the formula as a sentence (`say`). */
export function Formula({ formula }) {
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
