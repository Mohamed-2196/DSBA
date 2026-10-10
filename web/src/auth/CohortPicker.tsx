import { useId } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { COHORTS, YEARS, type CohortYear } from '../state';
import { cx } from '../ui';
import './SignInDialog.css';

/** A cohort, 'none' (not a current student), or null while nothing is chosen. */
export type CohortChoice = CohortYear | 'none' | null;

export interface CohortPickerProps {
  value: CohortChoice;
  onChange: (value: CohortYear | 'none') => void;
  error?: string | null;
  legend?: string;
  hint?: string;
}

/** Year 1 / 2 / 3 / Not a current student, as radio cards in the cohort colours. */
export function CohortPicker({ value, onChange, error, legend = 'Your cohort', hint }: CohortPickerProps) {
  const uid = useId().replace(/:/g, '');
  const errId = `${uid}-err`;
  const hintId = `${uid}-hint`;
  const describedBy = error ? errId : hint ? hintId : undefined;
  const option = (v: CohortYear | 'none', label: string, cls: string) => (
    <div key={String(v)} className={cx('signin-cohort', cls)}>
      <input
        type="radio"
        id={`${uid}-${v}`}
        name={`cohort-${uid}`}
        value={String(v)}
        checked={value === v}
        onChange={() => onChange(v)}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      />
      <label htmlFor={`${uid}-${v}`}>
        {v !== 'none' ? <span className="signin-cohort__dot" aria-hidden="true" /> : null}
        {label}
      </label>
    </div>
  );
  return (
    <fieldset className={cx('signin-cohorts', !!error && 'has-error')}>
      <legend>{legend}</legend>
      {YEARS.map((y) => option(y, COHORTS[y].label, `signin-cohort--y${y}`))}
      {option('none', 'Not a current student', 'signin-cohort--none signin-cohort--wide')}
      {error ? (
        <p id={errId} className="ui-field__error signin-cohorts__error">
          <WarningCircle aria-hidden="true" weight="fill" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="ui-field__hint signin-cohorts__error">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
