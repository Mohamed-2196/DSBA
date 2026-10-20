import { useId } from 'react';
import { Icon, cx, glyph } from '../ui';
import './SignInDialog.css';

export interface EmailChoiceProps {
  /** true: email me; false: don't; null: not answered (nothing is chosen in advance) */
  value: boolean | null;
  onChange: (value: boolean) => void;
  error?: string | null;
  /** the account has an email address to send them to */
  hasEmail: boolean;
}

/**
 * The question about notification emails a student answers when they sign up: yes or no, neither chosen in
 * advance. The answer starts every notification email switch on Your account (PATCH /me preferences
 * .notificationEmails). data-hub="signup-emails".
 */
export function EmailChoice({ value, onChange, error, hasEmail }: EmailChoiceProps) {
  const uid = useId().replace(/:/g, '');
  const errId = `${uid}-err`;
  const hintId = `${uid}-hint`;
  const option = (v: boolean, label: string) => (
    <div className="signin-cohort signin-cohort--answer">
      <input
        type="radio"
        id={`${uid}-${String(v)}`}
        name={`emails-${uid}`}
        value={v ? 'yes' : 'no'}
        checked={value === v}
        onChange={() => onChange(v)}
        aria-describedby={error ? `${errId} ${hintId}` : hintId}
        aria-invalid={error ? true : undefined}
      />
      <label htmlFor={`${uid}-${String(v)}`}>{label}</label>
    </div>
  );
  return (
    <fieldset className={cx('signin-cohorts', 'signin-emails', !!error && 'has-error')} data-hub="signup-emails">
      <legend>Email me about replies and date changes</legend>
      {option(true, 'Yes, email me')}
      {option(false, 'No, thanks')}
      {error ? (
        <p id={errId} className="ui-field__error signin-cohorts__error">
          <Icon glyph={glyph.error} />
          {error}
        </p>
      ) : null}
      <p id={hintId} className="ui-field__hint signin-cohorts__error">
        {hasEmail
          ? 'Also accepted answers, your uploads and new newsletter issues. You can change each one in Your account.'
          : 'Also accepted answers, your uploads and new newsletter issues, once you add an email address in Your account.'}
      </p>
    </fieldset>
  );
}
