// Sign in with a one-time code: email or phone number → the 6-digit code → (first time) name and cohort.
// Contract (auth/context.ts): shown while `request` is not null; on success it calls request.onSuccess?.()
// and then onClose(). Closing it half-way keeps a pending code, so reopening it goes back to the code.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { api, call } from '../api/client';
import { ApiError } from '../api/errors';
import type { Me, OtpChallengeOut } from '../api/types';
import { useToast, useYear, type CohortYear } from '../state';
import { Button, Modal, TextField } from '../ui';
import { CohortPicker, type CohortChoice } from './CohortPicker';
import type { SignInRequest } from './context';
import { checkIdentifier, identifierHint } from './identifiers';
import { CodeEntry } from './CodeEntry';
import { otpErrorMessage } from './otpErrors';
import { ME_KEY, refreshPersonalQueries } from './queries';
import { useAuth } from './useAuth';
import './SignInDialog.css';

export interface SignInDialogProps {
  request: SignInRequest | null;
  onClose: () => void;
}

type Step = 'identifier' | 'code' | 'profile';

interface Pending {
  challenge: OtpChallengeOut;
  receivedAt: number;
  identifier: string;
}

const NAME_MIN = 2;
const NAME_MAX = 40;

function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function SignInDialog({ request, onClose }: SignInDialogProps) {
  const open = request !== null;
  const qc = useQueryClient();
  const { me, status } = useAuth();
  const { push } = useToast();
  const { year: browsedYear } = useYear();

  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [idError, setIdError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [isNew, setIsNew] = useState(false);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [cohort, setCohort] = useState<CohortChoice>(null);
  const [cohortError, setCohortError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const idRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(request);
  requestRef.current = request;
  // The request whose onSuccess already ran: it runs once, whichever path finishes first (the action it
  // retries may not be safe to repeat, like posting a thread).
  const completedRef = useRef<SignInRequest | null>(null);

  const complete = () => {
    const req = requestRef.current;
    if (req && completedRef.current !== req) {
      completedRef.current = req;
      req.onSuccess?.();
    }
    onClose();
  };

  const pendingAlive = (p: Pending | null): p is Pending => !!p && Date.now() < p.receivedAt + p.challenge.expiresIn * 1000;

  // Where to start when the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (me?.needsProfile) {
      setName(me.displayName ?? '');
      setCohort(me.year ?? browsedYear ?? null);
      setStep('profile');
    } else if (!me) {
      setStep(pendingAlive(pending) ? 'code' : 'identifier');
    }
    // Only when it opens (or the person behind it changes), not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me?.id, me?.needsProfile]);

  // Already signed in with a profile (e.g. /me arrived after the dialog opened): nothing to ask.
  useEffect(() => {
    if (open && status === 'signed-in' && me && !me.needsProfile && step !== 'profile') complete();
    // complete() reads refs only; re-running it for a new function identity would change nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, status, me, step]);

  // Each step hands focus to its field.
  useEffect(() => {
    if (!open) return;
    const target = step === 'identifier' ? idRef : step === 'profile' ? nameRef : null;
    if (target) requestAnimationFrame(() => target.current?.focus({ preventScroll: true }));
  }, [open, step]);

  const finish = (user: Me) => {
    const greeting = firstName(user.displayName);
    push({ tone: 'success', title: isNew ? `Welcome to DSBA Hub${greeting ? `, ${greeting}` : ''}` : `Signed in${greeting ? ` as ${user.displayName}` : ''}` });
    setPending(null);
    setIdentifier('');
    setStep('identifier');
    complete();
  };

  const sendCode = async (value: string) => {
    const challenge = await call(api.POST('/api/v1/auth/otp', { body: { identifier: value } }));
    setPending({ challenge, receivedAt: Date.now(), identifier: value });
    setStep('code');
  };

  const onStart = async (e: FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    const check = checkIdentifier(value);
    if (check.error) {
      setIdError(check.error);
      idRef.current?.focus();
      return;
    }
    setIdError(null);
    setStarting(true);
    try {
      await sendCode(value);
    } catch (err) {
      setIdError(otpErrorMessage(err));
      idRef.current?.focus();
    } finally {
      setStarting(false);
    }
  };

  const onVerify = async (code: string) => {
    if (!pending) return;
    const result = await call(api.POST('/api/v1/auth/otp/verify', { body: { challengeId: pending.challenge.challengeId, code } }));
    qc.setQueryData(ME_KEY, result.user);
    void refreshPersonalQueries(qc);
    setPending(null);
    setIsNew(result.isNewUser);
    if (result.user.needsProfile) {
      setName(result.user.displayName ?? '');
      setCohort(result.user.year ?? browsedYear ?? null);
      setStep('profile');
    } else {
      finish(result.user);
    }
  };

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const displayName = name.trim().replace(/\s+/g, ' ');
    const nErr =
      displayName.length < NAME_MIN ? 'Enter your name (at least 2 characters).' : displayName.length > NAME_MAX ? `Keep it to ${NAME_MAX} characters.` : null;
    const cErr = cohort === null ? 'Choose your year, or “Not a current student”.' : null;
    setNameError(nErr);
    setCohortError(cErr);
    setSaveError(null);
    if (nErr || cErr) {
      if (nErr) nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const year: CohortYear | null = cohort === 'none' ? null : cohort;
      const user = await call(api.PATCH('/api/v1/me', { body: { displayName, year } }));
      qc.setQueryData(ME_KEY, user);
      finish(user);
    } catch (err) {
      if (err instanceof ApiError && err.fields.displayName) {
        setNameError(err.fields.displayName);
        nameRef.current?.focus();
      } else if (err instanceof ApiError && err.code === 'network') {
        setSaveError('Couldn’t reach the Hub. Check your connection and try again.');
      } else {
        setSaveError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const channel = pending?.challenge.channel;
  const title =
    step === 'profile'
      ? 'Set up your profile'
      : step === 'code'
        ? channel === 'sms'
          ? 'Check your messages'
          : 'Check your email'
        : request?.reason || 'Sign in to DSBA Hub';
  const description =
    step === 'profile'
      ? 'This is how classmates see you on the forum and in the library.'
      : step === 'code' && pending
        ? `Sent to ${pending.challenge.destinationHint}.`
        : 'Use your email or phone number. New here? This creates your account.';

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm" className="signin-dialog" data-hub="sign-in">
      <div className="signin">
        {step === 'identifier' ? (
          <form className="signin__form" onSubmit={onStart} noValidate>
            <TextField
              ref={idRef}
              label="Email or phone number"
              size="lg"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (idError) setIdError(null);
              }}
              error={idError}
              hint={identifierHint(identifier)}
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={254}
              data-autofocus
            />
            <div className="visually-hidden" aria-live="polite">
              {idError || ''}
            </div>
            <Button type="submit" variant="primary" size="lg" fullWidth loading={starting}>
              Send code
            </Button>
            <p className="signin__fine">We only use it to sign you in and, if you want, to tell you about replies.</p>
          </form>
        ) : null}

        {step === 'code' && pending ? (
          <CodeEntry
            challenge={pending.challenge}
            receivedAt={pending.receivedAt}
            onVerify={onVerify}
            onResend={() => sendCode(pending.identifier)}
            onBack={() => {
              setPending(null);
              setStep('identifier');
            }}
          />
        ) : null}

        {step === 'profile' ? (
          <form className="signin__form" onSubmit={onSaveProfile} noValidate>
            <TextField
              ref={nameRef}
              label="Display name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              error={nameError}
              hint="Your name as classmates know it, like “Fatima A.”"
              autoComplete="name"
              maxLength={NAME_MAX}
              data-autofocus
            />
            <CohortPicker
              value={cohort}
              onChange={(v) => {
                setCohort(v);
                setCohortError(null);
              }}
              error={cohortError}
              hint="Your modules and exams come first. You can still browse every year."
            />
            {saveError ? (
              <p className="signin__alert" role="alert">
                <WarningCircle aria-hidden="true" weight="fill" />
                {saveError}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" fullWidth loading={saving}>
              Save and continue
            </Button>
          </form>
        ) : null}
      </div>
    </Modal>
  );
}
