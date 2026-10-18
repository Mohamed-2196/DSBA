// "Confirm it's you" (decision D2): changing how an account signs in, deleting it, or an admin changing access needs
// a code sent to an address the account already has, unless the session is under 10 minutes old. The API answers 403
// step_up_required; the session guard opens this dialog, and sends the change again once the code is right.
import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { api, call } from '../api/client';
import type { Me, OtpChallengeOut } from '../api/types';
import { Button, Modal, Skeleton } from '../ui';
import { CodeEntry } from './CodeEntry';
import { formatPhone } from './identifiers';
import { otpErrorMessage } from './otpErrors';
import './SignInDialog.css';

type Via = 'email' | 'phone';

export interface StepUpDialogProps {
  /** what the code allows, after "to": 'delete your account'; null: closed */
  purpose: string | null;
  me: Me | null;
  /** true: the session is renewed and the change can go ahead; false: the person gave up */
  onDone: (ok: boolean) => void;
}

interface Pending {
  challenge: OtpChallengeOut;
  receivedAt: number;
  via: Via;
}

export function StepUpDialog({ purpose, me, onDone }: StepUpDialogProps) {
  const open = purpose !== null;
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const first: Via = me?.email ? 'email' : 'phone';
  const other: Via | null = me?.email && me?.phone ? 'phone' : null;

  const send = async (via: Via) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const challenge = await call(api.POST('/api/v1/me/step-up', { body: { via } }));
      setPending({ challenge, receivedAt: Date.now(), via });
    } catch (e) {
      setPending(null);
      setError(otpErrorMessage(e));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  // A code goes out as the dialog opens: the person already asked for the change.
  useEffect(() => {
    if (!open) return;
    setPending(null);
    setError(null);
    void send(first);
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const verify = async (code: string) => {
    if (!pending) return;
    await call(api.POST('/api/v1/me/step-up/verify', { body: { challengeId: pending.challenge.challengeId, code } }));
    onDone(true);
  };

  const where = (via: Via) =>
    via === 'email' ? (me?.email ?? 'your email address') : me?.phone ? formatPhone(me.phone) : 'your phone';
  const switchTo: Via | null = pending
    ? pending.via === 'email'
      ? me?.phone
        ? 'phone'
        : null
      : me?.email
        ? 'email'
        : null
    : other;

  return (
    <Modal
      open={open}
      onClose={() => onDone(false)}
      title="Confirm it’s you"
      description={
        pending
          ? `To ${purpose ?? 'make this change'}, enter the code we sent to ${where(pending.via)}.`
          : `To ${purpose ?? 'make this change'}, we’ll send a code to ${where(first)}.`
      }
      size="sm"
      className="signin-dialog"
      data-hub="step-up"
    >
      <div className="signin">
        {pending ? (
          <CodeEntry
            challenge={pending.challenge}
            receivedAt={pending.receivedAt}
            onVerify={verify}
            onResend={() => send(pending.via)}
            onBack={switchTo ? () => void send(switchTo) : undefined}
            backLabel={switchTo === 'phone' ? 'Text my phone instead' : 'Email me instead'}
            submitLabel="Confirm"
          />
        ) : error ? (
          <div className="signin__form">
            <p className="signin__alert" role="alert">
              <WarningCircle aria-hidden="true" weight="fill" />
              {error}
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              leadingIcon={ArrowClockwise}
              loading={sending}
              onClick={() => void send(first)}
            >
              Send the code again
            </Button>
            {other ? (
              <Button variant="ghost" size="sm" onClick={() => void send(other)} disabled={sending}>
                Text my phone instead
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="signin__form" aria-busy="true">
            <span className="visually-hidden" role="status">
              Sending a code…
            </span>
            <Skeleton height={56} />
            <Skeleton height={48} />
          </div>
        )}
      </div>
    </Modal>
  );
}
