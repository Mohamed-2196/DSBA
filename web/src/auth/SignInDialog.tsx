// Sign in or sign up: Continue with Google, or an email address and a password → (first time) name, cohort and
// whether we email them about their notifications. A forgotten password: Google, or a reset link from an admin.
// AuthProvider shows it while someone needs to sign in, and calls the waiting actions once onDone() runs.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, call } from '../api/client';
import { ApiError, errorMessage } from '../api/errors';
import type { Me } from '../api/types';
import { useToast, useYear, type CohortYear } from '../state';
import { Button, HubLogo, Icon, Modal, TextField, glyph } from '../ui';
import { authErrorMessage, checkEmail, checkNewPassword, fieldOf } from './authErrors';
import { CohortPicker, type CohortChoice } from './CohortPicker';
import { EmailChoice } from './EmailChoice';
import { GoogleButton } from './GoogleButton';
import { PasswordField } from './PasswordField';
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

type Step = 'sign-in' | 'sign-up' | 'forgot' | 'profile';

const NAME_MIN = 2;
const NAME_MAX = 40;

function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function SignInDialog({ open, reason, resumes = false, reauth = false, onDone, onDismiss }: SignInDialogProps) {
  const qc = useQueryClient();
  const { me, status, googleSignIn } = useAuth();
  const { push } = useToast();
  const { year: browsedYear } = useYear();

  const [step, setStep] = useState<Step>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [cohort, setCohort] = useState<CohortChoice>(null);
  const [cohortError, setCohortError] = useState<string | null>(null);
  // whether we email them about replies and date changes: asked with no answer chosen in advance
  const [emails, setEmails] = useState<boolean | null>(null);
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const clearErrors = () => {
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
  };

  // Where to start when the dialog opens.
  useEffect(() => {
    if (!open) return;
    clearErrors();
    setPassword('');
    if (reauth) {
      // Signing in again: their address is filled in (they can change it).
      if (me) setEmail(me.email);
      setStep('sign-in');
    } else if (me?.needsProfile) {
      setName(me.displayName ?? '');
      setCohort(me.year ?? browsedYear ?? null);
      setEmails(me.preferences.notificationEmails);
      setStep('profile');
    } else if (!me) {
      setStep('sign-in');
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

  // Each step hands focus to its first field.
  useEffect(() => {
    if (!open) return;
    const target = step === 'profile' ? nameRef : step === 'forgot' ? null : reauth ? passwordRef : emailRef;
    if (target) requestAnimationFrame(() => target.current?.focus({ preventScroll: true }));
  }, [open, step, reauth]);

  const finish = (user: Me) => {
    const greeting = firstName(user.displayName);
    if (isNew) push({ tone: 'success', title: `Welcome to DSBA Hub${greeting ? `, ${greeting}` : ''}` });
    else if (!resumes) push({ tone: 'success', title: `Signed in${greeting ? ` as ${user.displayName}` : ''}` });
    setPassword('');
    setStep('sign-in');
    onDone();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const creating = step === 'sign-up';
    const eErr = checkEmail(email);
    const pErr = creating ? checkNewPassword(password) : password ? null : 'Enter your password.';
    setEmailError(eErr);
    setPasswordError(pErr);
    setFormError(null);
    if (eErr || pErr) {
      (eErr ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSending(true);
    try {
      const body = { email: email.trim(), password };
      const result = await call(
        creating ? api.POST('/api/v1/auth/sign-up', { body }) : api.POST('/api/v1/auth/sign-in', { body }),
      );
      qc.setQueryData(ME_KEY, result.user);
      void refreshPersonalQueries(qc);
      setIsNew(result.isNewUser);
      if (result.user.needsProfile) {
        setName(result.user.displayName ?? '');
        setCohort(result.user.year ?? browsedYear ?? null);
        setEmails(result.user.preferences.notificationEmails);
        setStep('profile');
      } else {
        finish(result.user);
      }
    } catch (err) {
      const message = authErrorMessage(err);
      const field = fieldOf(err);
      if (field === 'email') {
        setEmailError(message);
        emailRef.current?.focus();
      } else if (field === 'password') {
        setPasswordError(message);
        passwordRef.current?.focus();
      } else {
        setFormError(message);
      }
    } finally {
      setSending(false);
    }
  };

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const displayName = name.trim().replace(/\s+/g, ' ');
    const nErr =
      displayName.length < NAME_MIN
        ? 'Enter your name (at least 2 characters).'
        : displayName.length > NAME_MAX
          ? `Keep it to ${NAME_MAX} characters.`
          : null;
    const cErr = cohort === null ? 'Choose your year, or “Not a current student”.' : null;
    setNameError(nErr);
    setCohortError(cErr);
    setEmailsError(emails === null ? 'Choose yes or no.' : null);
    setSaveError(null);
    if (nErr || cErr || emails === null) {
      if (nErr) nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const year: CohortYear | null = cohort === 'none' ? null : cohort;
      const preferences = { notificationEmails: emails };
      const user = await call(api.PATCH('/api/v1/me', { body: { displayName, year, preferences } }));
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

  const switchTo = (next: Step) => {
    clearErrors();
    setStep(next);
  };

  const title =
    step === 'profile'
      ? 'Set up your profile'
      : step === 'sign-up'
        ? 'Create your account'
        : step === 'forgot'
          ? 'Forgot your password?'
          : reason || 'Sign in to DSBA Hub';
  // Every step carries the lockup above its title, so the dialog reads as the hub's own.
  const heading = (
    <>
      <HubLogo variant="lockup" size={30} decorative className="signin__brand" />
      {title}
    </>
  );
  const description =
    step === 'profile'
      ? 'This is how classmates see you on the forum and in the library.'
      : step === 'sign-up'
        ? 'Reading is open to everyone. An account lets you post, upload and keep your own things.'
        : step === 'forgot'
          ? 'There are two ways back in.'
          : googleSignIn
            ? 'Continue with Google, or use your email address and password.'
            : 'Use your email address and password.';
  const alert = formError ? (
    <p className="signin__alert" role="alert">
      <Icon glyph={glyph.error} />
      {formError}
    </p>
  ) : null;

  return (
    <Modal
      open={open}
      onClose={onDismiss}
      title={heading}
      description={description}
      size="sm"
      className="signin-dialog"
      data-hub="sign-in"
    >
      <div className="signin">
        {step === 'sign-in' || step === 'sign-up' ? (
          <form className="signin__form" onSubmit={onSubmit} noValidate data-hub={step}>
            {googleSignIn ? (
              <>
                <GoogleButton
                  label={step === 'sign-up' ? 'Sign up with Google' : 'Continue with Google'}
                  onError={setFormError}
                />
                <p className="signin__or" aria-hidden="true">
                  or
                </p>
              </>
            ) : null}
            <TextField
              ref={emailRef}
              label="Email address"
              size="lg"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
                if (formError) setFormError(null);
              }}
              error={emailError}
              type="email"
              inputMode="email"
              autoComplete={step === 'sign-up' ? 'email' : 'username'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={254}
              data-autofocus
            />
            <PasswordField
              ref={passwordRef}
              label="Password"
              size="lg"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(null);
                if (formError) setFormError(null);
              }}
              error={passwordError}
              hint={step === 'sign-up' ? 'At least 10 characters. A few words together are easy to remember.' : null}
              autoComplete={step === 'sign-up' ? 'new-password' : 'current-password'}
            />
            {alert}
            <Button type="submit" variant="primary" size="lg" fullWidth loading={sending}>
              {step === 'sign-up' ? 'Create account' : 'Sign in'}
            </Button>
            <div className="signin__links">
              {step === 'sign-in' ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => switchTo('sign-up')}>
                    New here? Create an account
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => switchTo('forgot')}>
                    Forgot your password?
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => switchTo('sign-in')}>
                  Have an account? Sign in
                </Button>
              )}
            </div>
            {step === 'sign-up' && googleSignIn ? (
              <p className="signin__fine">
                Nobody checks your email address now. Continue with Google later to confirm it.
              </p>
            ) : null}
          </form>
        ) : null}

        {step === 'forgot' ? (
          <div className="signin__form" data-hub="forgot">
            <ol className="signin__help">
              {googleSignIn ? (
                <li>
                  If your address is a Gmail or Google account, continue with Google. You’re signed in, and you can set
                  a new password in Your account.
                </li>
              ) : null}
              <li>Ask an admin for a reset link. It works once, within an hour.</li>
            </ol>
            {googleSignIn ? <GoogleButton onError={setFormError} /> : null}
            {alert}
            <Button variant="ghost" size="sm" onClick={() => switchTo('sign-in')}>
              Back to sign in
            </Button>
          </div>
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
            <EmailChoice
              value={emails}
              onChange={(v) => {
                setEmails(v);
                setEmailsError(null);
              }}
              error={emailsError}
            />
            {saveError ? (
              <p className="signin__alert" role="alert">
                <Icon glyph={glyph.error} />
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
