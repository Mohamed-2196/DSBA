// /reset-password#token=…: a one-time link an admin made for someone who forgot their password. The token is in the
// address's fragment, so it never reaches a server log or a Referer. Setting the password signs this browser in and
// every other one out.
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, call } from '../../api/client';
import { ApiError } from '../../api/errors';
import { ME_KEY } from '../../auth';
import { authErrorMessage, checkNewPassword } from '../../auth/authErrors';
import { PasswordField } from '../../auth/PasswordField';
import { useToast } from '../../state';
import { Button, EmptyState, Icon, Page, PageHeader, Panel, glyph } from '../../ui';
import { readResetToken } from './resetToken';
import './AccountPage.css';

export default function ResetPasswordPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { push } = useToast();
  const [token] = useState(() => readResetToken(window.location.hash));
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const problem = checkNewPassword(password);
    setError(problem);
    if (problem) {
      ref.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const result = await call(api.POST('/api/v1/auth/password-reset', { body: { token, newPassword: password } }));
      qc.setQueryData(ME_KEY, result.user);
      window.history.replaceState(window.history.state, '', window.location.pathname); // the token goes
      push({
        tone: 'success',
        title: 'Your new password is set',
        body: 'You’re signed in. Other devices were signed out.',
      });
      void navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'reset_link_invalid') setGone(true);
      setError(authErrorMessage(err));
      ref.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const unusable = !token || gone;
  return (
    <Page width="narrow">
      <PageHeader section="tools" title="Choose a new password" description="A reset link from an admin." />
      <Panel padding={unusable ? 'none' : 'md'}>
        {unusable ? (
          <EmptyState
            icon={<Icon glyph={glyph.lock} />}
            title={token ? 'This link has expired or was used' : 'This link is incomplete'}
            body={
              token
                ? 'Reset links work once, within an hour. Ask an admin for a new one.'
                : 'Open the whole link the admin sent you, or ask them for a new one.'
            }
          />
        ) : (
          <form className="acct-form" onSubmit={onSubmit} noValidate data-hub="reset-password">
            <PasswordField
              ref={ref}
              label="New password"
              size="lg"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              error={error}
              hint="At least 10 characters. A few words together are easy to remember."
              autoComplete="new-password"
              data-autofocus
            />
            <div className="acct-form__actions">
              <Button type="submit" variant="primary" loading={busy}>
                Set password and sign in
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </Page>
  );
}
