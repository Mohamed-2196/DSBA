// Sign in with a one-time code: email or phone number → the code → (first time) name and cohort.
// AuthProvider shows it while someone needs to sign in, and calls the waiting actions once onDone() runs.
// Closing it half-way keeps a pending code, so reopening it goes back to the code.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { api, call } from '../api/client';
import { ApiError, errorMessage } from '../api/errors';
import type { Me, OtpChallengeOut } from '../api/types';
import { useToast, useYear, type CohortYear } from '../state';
import { Button, Modal, TextField } from '../ui';
import { CohortPicker, type CohortChoice } from './CohortPicker';
import { checkIdentifier, displayIdentifier, formatPhone, identifierHint } from './identifiers';
import { CodeEntry } from './CodeEntry';
import { isAddressProblem, otpErrorMessage } from './otpErrors';
import { ME_KEY, refreshPersonalQueries } from './queries';
import { useAuth } from './useAuth';
import './SignInDialog.css';

export interface SignInDialogProps {
  open: boolean;
  /** why sign-in is needed ('Sign in to reply'): the title of the first step */
  reason?: string;
  /** an action carries on after signing in: it is the confirmation, so no "Signed in" toast covers it (UX-8) */
  resumes?: boolean;
  /** the session ended under the person shown as signed in: they sign in again (the app still shows them) */
  reauth?: boolean;
  /** signed in, with a profile */
  onDone: () => void;
  /** closed before that */
  onDismiss: () => void;
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

export function SignInDialog({ open, reason, resumes = false, reauth = false, onDone, onDismiss }: SignInDialogProps) {
  const qc = useQueryClient();
  const { me, status } = useAuth();
  const { push } = useToast();
  const { year: browsedYear } = useYear();

  const [step, setStep] = useState<Step>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [idError, setIdError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
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

  const pendingAlive = (p: Pending | null): p is Pending => !!p && Date.now() < p.receivedAt + p.challenge.expiresIn * 1000;

  // Where to start when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStartError(null);
    if (reauth) {
      // Signing in again: their address is filled in (they can change it).
      if (me && !pendingAlive(pending)) setIdentifier(me.email ?? (me.phone ? formatPhone(me.phone) : ''));
      setStep(pendingAlive(pending) ? 'code' : 'identifier');
    } else if (me?.needsProfile) {
      setName(me.displayName ?? '');
      setCohort(me.year ?? browsedYear ?? null);
      setStep('profile');
    } else if (!me) {
      setStep(pendingAlive(pending) ? 'code' : 'identifier');
    }
    // Only when it opens (or the person behind it changes), not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reauth, me?.id, me?.needsProfile]);

  // Already signed in with a profile (e.g. the session arrived after the dialog opened): nothing to ask.
  useEffect(() => {
    if (open && !reauth && status === 'signed-in' && me && !me.needsProfile && step !== 'profile') onDone();
    // onDone runs the waiting actions once, however often it is called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reauth, status, me, step]);

  // Each step hands focus to its field.
  useEffect(() => {
    if (!open) return;
    const target = step === 'identifier' ? idRef : step === 'profile' ? nameRef : null;
    if (target) requestAnimationFrame(() => target.current?.focus({ preventScroll: true }));
  }, [open, step]);

  const finish = (user: Me) => {
    const greeting = firstName(user.displayName);
    if (isNew) push({ tone: 'success', title: `Welcome to DSBA Hub${greeting ? `, ${greeting}` : ''}` });
    else if (!resumes) push({ tone: 'success', title: `Signed in${greeting ? ` as ${user.displayName}` : ''}` });
    setPending(null);
    setIdentifier('');
    setStep('identifier');
    onDone();
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
    setStartError(null);
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
      if (isAddressProblem(err)) {
        setIdError(otpErrorMessage(err));
        idRef.current?.focus();
      } else {
        setStartError(otpErrorMessage(err));
      }
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
      } else {
        setSaveError(errorMessage(err));
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
        : reason || 'Sign in to DSBA Hub';
  const description =
    step === 'profile'
      ? 'This is how classmates see you on the forum and in the library.'
      : step === 'code' && pending
        ? `Sent to ${displayIdentifier(pending.identifier)}.`
        : 'Use your email or phone number. New here? This creates your account.';
  // A number gets the phone keypad; anything else the email keyboard (UX-17).
  const numeric = /^\s*[+\d]/.test(identifier);

  return (
    <Modal open={open} onClose={onDismiss} title={title} description={description} size="sm" className="signin-dialog" data-hub="sign-in">
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
                if (startError) setStartError(null);
              }}
              error={idError}
              hint={identifierHint(identifier)}
              type="text"
              inputMode={numeric ? 'tel' : 'email'}
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
            {startError ? (
              <p className="signin__alert" role="alert">
                <WarningCircle aria-hidden="true" weight="fill" />
                {startError}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" fullWidth loading={starting}>
              Send code
            </Button>
            <p className="signin__fine">
              We use it to sign you in. Emails about replies and new newsletter issues are on until you turn them off in Your account.
            </p>
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
