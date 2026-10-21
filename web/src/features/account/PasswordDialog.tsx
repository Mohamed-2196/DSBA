import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Me } from '../../api/types';
import { authErrorMessage, checkNewPassword, fieldOf } from '../../auth/authErrors';
import { PasswordField } from '../../auth/PasswordField';
import { useToast } from '../../state';
import { Button, Icon, Modal, glyph } from '../../ui';
import { useSetPassword } from './api';

/** Change the password (with the current one), or add one to an account that signs in with Google. The server signs
 *  out every other device. Adding one needs a recent sign-in: the session guard asks the person to confirm first. */
export function PasswordDialog({ me, open, onClose }: { me: Me; open: boolean; onClose: () => void }) {
  const { push } = useToast();
  const save = useSetPassword();
  const changing = me.hasPassword;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setNext('');
    setCurrentError(null);
    setNextError(null);
    setFormError(null);
  }, [open]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cErr = changing && !current ? 'Enter your current password.' : null;
    const nErr = checkNewPassword(next);
    setCurrentError(cErr);
    setNextError(nErr);
    setFormError(null);
    if (cErr || nErr) {
      (cErr ? currentRef : nextRef).current?.focus();
      return;
    }
    save.mutate(changing ? { currentPassword: current, newPassword: next } : { newPassword: next }, {
      onSuccess: () => {
        push({
          tone: 'success',
          title: changing ? 'Password changed' : 'Password added',
          body: 'To be safe, your other devices were signed out.',
        });
        onClose();
      },
      onError: (err) => {
        const message = authErrorMessage(err);
        const field = fieldOf(err);
        if (field === 'currentPassword') {
          setCurrentError(message);
          currentRef.current?.focus();
        } else if (field === 'newPassword') {
          setNextError(message);
          nextRef.current?.focus();
        } else {
          setFormError(message);
        }
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={changing ? 'Change your password' : 'Add a password'}
      description={
        changing
          ? 'Your other devices are signed out afterwards.'
          : 'Then you can sign in with your email address and this password too.'
      }
      size="sm"
      data-hub="password"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="acct-password" variant="primary" loading={save.isPending}>
            {changing ? 'Change password' : 'Add password'}
          </Button>
        </>
      }
    >
      <form id="acct-password" className="acct-form" onSubmit={onSubmit} noValidate>
        <input type="email" autoComplete="username" value={me.email} readOnly hidden />
        {changing ? (
          <PasswordField
            ref={currentRef}
            label="Current password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              if (currentError) setCurrentError(null);
            }}
            error={currentError}
            autoComplete="current-password"
            data-autofocus
          />
        ) : null}
        <PasswordField
          ref={nextRef}
          label="New password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            if (nextError) setNextError(null);
          }}
          error={nextError}
          hint="At least 8 characters. A few words together are easy to remember."
          autoComplete="new-password"
          data-autofocus={changing ? undefined : true}
        />
        {formError ? (
          <p className="acct-alert" role="alert">
            <Icon glyph={glyph.error} />
            {formError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
