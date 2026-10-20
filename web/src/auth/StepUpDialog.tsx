// "Confirm it's you" (decision D2): deleting the account, adding a password or Google, or an admin changing access
// needs a session under 10 minutes old. The API answers 403 step_up_required; the session guard opens this dialog,
// and sends the change again once the password is right. An account that signs in with Google confirms by
// continuing with Google again: the page comes back signed in afresh, and the person does the change once more.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, call } from '../api/client';
import type { Me } from '../api/types';
import { Button, Icon, Modal, glyph } from '../ui';
import { authErrorMessage } from './authErrors';
import { GoogleButton } from './GoogleButton';
import { PasswordField } from './PasswordField';
import './SignInDialog.css';

export interface StepUpDialogProps {
  /** what confirming allows, after "to": 'delete your account'; null: closed */
  purpose: string | null;
  me: Me | null;
  /** "Continue with Google" is set up on this hub */
  googleSignIn: boolean;
  /** true: the session is renewed and the change can go ahead; false: the person gave up */
  onDone: (ok: boolean) => void;
}

export function StepUpDialog({ purpose, me, googleSignIn, onDone }: StepUpDialogProps) {
  const open = purpose !== null;
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const withPassword = !!me?.hasPassword;
  const withGoogle = googleSignIn && !!me?.googleLinked;

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setError(null);
  }, [open]);

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password.');
      ref.current?.focus();
      return;
    }
    setSending(true);
    setError(null);
    try {
      await call(api.POST('/api/v1/me/step-up', { body: { password } }));
      setPassword('');
      onDone(true);
    } catch (err) {
      setError(authErrorMessage(err));
      ref.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const what = purpose ?? 'make this change';
  const description = withPassword
    ? `To ${what}, enter your password${withGoogle ? ', or continue with Google' : ''}.`
    : withGoogle
      ? `To ${what}, continue with Google. You’ll come back here; then do it once more.`
      : `To ${what}, sign out and sign in again, then do it once more.`;

  return (
    <Modal
      open={open}
      onClose={() => onDone(false)}
      title="Confirm it’s you"
      description={description}
      size="sm"
      className="signin-dialog"
      data-hub="step-up"
    >
      <div className="signin">
        {withPassword ? (
          <form className="signin__form" onSubmit={confirm} noValidate>
            <input type="email" autoComplete="username" value={me?.email ?? ''} readOnly hidden />
            <PasswordField
              ref={ref}
              label="Password"
              size="lg"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              error={error}
              autoComplete="current-password"
              data-autofocus
            />
            <Button type="submit" variant="primary" size="lg" fullWidth loading={sending}>
              Confirm
            </Button>
          </form>
        ) : null}
        {withGoogle ? (
          <>
            {withPassword ? (
              <p className="signin__or" aria-hidden="true">
                or
              </p>
            ) : null}
            <GoogleButton onError={setError} />
            {!withPassword && error ? (
              <p className="signin__alert" role="alert">
                <Icon glyph={glyph.error} />
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
