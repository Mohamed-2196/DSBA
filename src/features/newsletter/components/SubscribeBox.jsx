import { useState } from 'react';
import { CheckCircle, EnvelopeSimple } from '@phosphor-icons/react';
import { Button, Select, TextField, cx } from '../../../ui';
import { useLocalStorage, useToast, useYear } from '../../../state';
import './SubscribeBox.css';

export const SUBSCRIPTION_KEY = 'hub.newsletter.subscription';

const COHORT_OPTIONS = [
  { value: '1', label: 'Year 1' },
  { value: '2', label: 'Year 2' },
  { value: '3', label: 'Year 3' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'staff', label: 'Tutor or staff' },
];
const cohortName = (v) => COHORT_OPTIONS.find((o) => o.value === v)?.label || null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Mock subscription form: email + cohort → success toast, then a "subscribed" state (kept in localStorage).
 * @param {'panel'|'band'} variant  panel: a bordered box (sidebar); band: a wide strip (end of an issue)
 * @param title, body  optional copy overrides
 */
export function SubscribeBox({ variant = 'panel', title = 'Get The DSBA Newsletter every Monday', body, className }) {
  const { year } = useYear();
  const { push } = useToast();
  const [subscription, setSubscription] = useLocalStorage(SUBSCRIPTION_KEY, null);
  const [email, setEmail] = useState('');
  const [cohort, setCohort] = useState(year ? String(year) : '');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  const subscribed = subscription?.email && !editing;

  const onSubmit = (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setError('Enter your email address.');
      return;
    }
    if (!EMAIL_RE.test(value)) {
      setError('Enter an email address like name@example.com.');
      return;
    }
    setError(null);
    setSubscription({ email: value, cohort: cohort || null });
    setEditing(false);
    push({ title: 'Subscribed: you’ll get The DSBA Newsletter every Monday', body: `We’ll send it to ${value}.`, tone: 'success' });
  };

  const copy = body ?? 'One short email a week: what changed on the hub, the dates that matter for your cohort and the best of the forum. Unsubscribe from any issue.';

  return (
    <section className={cx('nl-subscribe', `nl-subscribe--${variant}`, subscribed && 'is-subscribed', className)} data-hub="subscribe" aria-label="Subscribe to The DSBA Newsletter">
      <div className="nl-subscribe__text">
        <EnvelopeSimple className="nl-subscribe__icon" weight="duotone" aria-hidden="true" />
        <h2 className="nl-subscribe__title">{subscribed ? 'You’re on the list' : title}</h2>
        <p className="nl-subscribe__body">
          {subscribed
            ? `The DSBA Newsletter goes to ${subscription.email}${cohortName(subscription.cohort) ? ` (${cohortName(subscription.cohort)})` : ''} every Monday.`
            : copy}
        </p>
      </div>
      {subscribed ? (
        <div className="nl-subscribe__done">
          <p className="nl-subscribe__status" role="status">
            <CheckCircle weight="fill" aria-hidden="true" />
            Subscribed
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEmail(subscription.email);
              setCohort(subscription.cohort || '');
              setEditing(true);
            }}
          >
            Change email
          </Button>
        </div>
      ) : (
        <form className="nl-subscribe__form" onSubmit={onSubmit} noValidate>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            error={error}
            className="nl-subscribe__email"
          />
          <Select label="Cohort" options={COHORT_OPTIONS} placeholder="Choose one" value={cohort} onChange={(e) => setCohort(e.target.value)} className="nl-subscribe__cohort" />
          <Button type="submit" variant="primary" className="nl-subscribe__submit">
            Subscribe
          </Button>
        </form>
      )}
    </section>
  );
}
