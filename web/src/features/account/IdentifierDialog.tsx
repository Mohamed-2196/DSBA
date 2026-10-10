// Add or change the email address or phone number on the account: the new one gets a code, like sign-in.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, call } from '../../api/client';
import type { OtpChallengeOut } from '../../api/types';
import { ME_KEY } from '../../auth';
import { checkIdentifier } from '../../auth/identifiers';
import { CodeEntry } from '../../auth/CodeEntry';
import { otpErrorMessage } from '../../auth/otpErrors';
import { useToast } from '../../state';
import { Button, Modal, TextField } from '../../ui';
import { SESSIONS_KEY, type IdentifierKind } from './api';

interface IdentifierDialogProps {
  /** which one to add or change; null = closed */
  kind: IdentifierKind | null;
  /** what the account has now (null: add) */
  current: string | null;
  onClose: () => void;
}

const NOUN: Record<IdentifierKind, string> = { email: 'email address', phone: 'phone number' };

export function IdentifierDialog({ kind, current, onClose }: IdentifierDialogProps) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<{ challenge: OtpChallengeOut; receivedAt: number; identifier: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [shownKind, setShownKind] = useState<IdentifierKind>('email');

  // Each opening starts afresh (the dialog stays mounted so it can animate out).
  useEffect(() => {
    if (!kind) return;
    setShownKind(kind);
    setValue('');
    setError(null);
    setPending(null);
  }, [kind]);

  const noun = NOUN[shownKind];
  const changing = !!current;

  const send = async (identifier: string) => {
    const challenge = await call(api.POST('/api/v1/me/identifiers/otp', { body: { identifier } }));
    setPending({ challenge, receivedAt: Date.now(), identifier });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const identifier = value.trim();
    const check = checkIdentifier(identifier);
    const wrongKind = !check.error && check.kind !== shownKind;
    if (check.error || wrongKind) {
      setError(wrongKind ? `Enter ${shownKind === 'email' ? 'an email address' : 'a phone number'}.` : check.error);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setSending(true);
    try {
      await send(identifier);
    } catch (err) {
      setError(otpErrorMessage(err));
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const onVerify = async (code: string) => {
    if (!pending) return;
    const me = await call(api.POST('/api/v1/me/identifiers/verify', { body: { challengeId: pending.challenge.challengeId, code } }));
    qc.setQueryData(ME_KEY, me);
    // The server signs out the account's other devices when a way to sign in changes.
    void qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    push({
      tone: 'success',
      title: changing ? `Your ${noun} is changed` : `${noun[0].toUpperCase()}${noun.slice(1)} added`,
      body: 'To be safe, your other devices were signed out.',
    });
    onClose();
  };

  const title = `${changing ? 'Change your' : 'Add'} ${changing ? noun : shownKind === 'email' ? 'an email address' : 'a phone number'}`;
  const description = pending
    ? `Sent to ${pending.challenge.destinationHint}.`
    : `We’ll send a code to the new ${noun} to check it’s yours.`;

  return (
    <Modal open={kind !== null} onClose={onClose} title={title} description={description} size="sm">
      <div className="signin">
        {pending ? (
          <CodeEntry
            challenge={pending.challenge}
            receivedAt={pending.receivedAt}
            onVerify={onVerify}
            onResend={() => send(pending.identifier)}
            onBack={() => setPending(null)}
            backLabel={shownKind === 'email' ? 'Use a different email address' : 'Use a different number'}
          />
        ) : (
          <form className="signin__form" onSubmit={onSubmit} noValidate>
            <TextField
              ref={inputRef}
              label={shownKind === 'email' ? 'New email address' : 'New phone number'}
              size="lg"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              error={error}
              hint={shownKind === 'phone' ? 'Bahraini numbers don’t need +973.' : undefined}
              type={shownKind === 'email' ? 'email' : 'tel'}
              inputMode={shownKind === 'email' ? 'email' : 'tel'}
              autoComplete={shownKind === 'email' ? 'email' : 'tel'}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              data-autofocus
            />
            <div className="visually-hidden" aria-live="polite">
              {error || ''}
            </div>
            <Button type="submit" variant="primary" size="lg" fullWidth loading={sending}>
              Send code
            </Button>
          </form>
        )}
      </div>
    </Modal>
  );
}
