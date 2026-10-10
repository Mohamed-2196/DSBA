import { BellSimple, CheckCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { useToast } from '../../../state';
import { Button, Skeleton, cx } from '../../../ui';
import { useNewsletterEmails } from '../api';
import './SubscribeBox.css';

export interface SubscribeBoxProps {
  /** panel: a bordered box (beside the archive); band: a wide strip (end of an issue) */
  variant?: 'panel' | 'band';
  className?: string;
}

/**
 * Hearing about new issues: the account's newsletter preference (PATCH /api/v1/me, `newsletterEmails`). Publishing
 * an issue notifies everyone who hasn't turned it off; for now that is a notification in the Hub (no email yet), so
 * the copy promises being told, not an email. Guests are asked to sign in first.
 */
export function SubscribeBox({ variant = 'panel', className }: SubscribeBoxProps) {
  const { me, status, requireAuth } = useAuth();
  const { push } = useToast();
  const news = useNewsletterEmails();

  const set = (on: boolean) =>
    news.mutate(on, {
      onSuccess: () =>
        push(
          on
            ? { tone: 'success', title: 'Subscribed', body: 'We’ll let you know when the next issue is out.' }
            : { tone: 'info', title: 'You won’t hear about new issues', body: 'They still show up here and on Home.' },
        ),
      onError: (e) => push({ tone: 'alert', title: 'That didn’t save', body: errorMessage(e, 'Try again in a moment.') }),
    });

  const ready = status === 'signed-in' && !!me && !me.needsProfile;
  const on = ready && me.preferences.newsletterEmails;

  let title = 'Hear about new issues';
  let body = 'Sign in and we’ll let you know when a new issue is out. No timetable: only when there’s news worth your time.';
  if (on) {
    title = 'You’re on the list';
    body = 'We’ll let you know as soon as a new issue of The DSBA Newsletter is out.';
  } else if (ready) {
    body = 'We’ll let you know when a new issue is out. No timetable: only when there’s news worth your time.';
  }

  let action;
  if (status === 'loading') {
    action = <Skeleton width={180} height={40} radius={10} />;
  } else if (!ready) {
    action = (
      <Button variant="primary" className="nl-subscribe__submit" onClick={() => requireAuth('Sign in to hear about new issues of The DSBA Newsletter', () => set(true))} data-hub="subscribe-signin">
        Sign in to subscribe
      </Button>
    );
  } else if (on) {
    action = (
      <div className="nl-subscribe__done">
        <p className="nl-subscribe__status" role="status">
          <CheckCircle weight="fill" aria-hidden="true" />
          Subscribed
        </p>
        <Button variant="ghost" size="sm" onClick={() => set(false)} loading={news.isPending} data-hub="subscribe-off">
          Turn off
        </Button>
      </div>
    );
  } else {
    action = (
      <Button variant="primary" className="nl-subscribe__submit" onClick={() => set(true)} loading={news.isPending} data-hub="subscribe-on">
        Tell me about new issues
      </Button>
    );
  }

  return (
    <section className={cx('nl-subscribe', `nl-subscribe--${variant}`, on && 'is-subscribed', className)} data-hub="subscribe" aria-label="Hear about new issues of The DSBA Newsletter">
      <div className="nl-subscribe__text">
        <BellSimple className="nl-subscribe__icon" weight="duotone" aria-hidden="true" />
        <h2 className="nl-subscribe__title">{title}</h2>
        <p className="nl-subscribe__body">{body}</p>
        {ready ? (
          <p className="nl-subscribe__manage">
            <Link to="/account">Notification settings</Link>
          </p>
        ) : null}
      </div>
      <div className="nl-subscribe__action">{action}</div>
    </section>
  );
}
