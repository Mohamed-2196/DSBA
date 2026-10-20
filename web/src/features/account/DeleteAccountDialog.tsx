import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { ME_KEY, clearPersonalStorage, resetPersonalQueries } from '../../auth';
import { useToast } from '../../state';
import { Button, Icon, Modal, TextField, glyph } from '../../ui';
import { deleteAccount } from './api';

const WORD = 'DELETE';

/** Confirm by typing DELETE; then the account goes and the person lands on Home, signed out. */
export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { push } = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      setError(null);
    }
  }, [open]);

  const confirmed = typed.trim() === WORD;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      qc.setQueryData(ME_KEY, null);
      clearPersonalStorage();
      onClose();
      navigate('/', { replace: true });
      await resetPersonalQueries(qc);
      push({ tone: 'success', title: 'Your account is deleted', body: 'Thanks for being part of DSBA Hub.' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete your account?"
      description="This can’t be undone."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            leadingIcon={<Icon glyph={glyph.trash} />}
            type="submit"
            form="delete-account-form"
            disabled={!confirmed}
            loading={busy}
          >
            Delete my account
          </Button>
        </>
      }
    >
      <form id="delete-account-form" className="acct-delete" onSubmit={onSubmit} noValidate>
        <p>
          Your name, email address, password, stars, votes, reactions, lesson progress, notifications and bug reports
          are deleted, and you’re signed out everywhere.
        </p>
        <p>
          Your threads and replies stay, shown as from a deleted user. Library files that were published stay, without
          your name.
        </p>
        <TextField
          label={
            <>
              Type <span className="u-mono">{WORD}</span> to confirm
            </>
          }
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          data-autofocus
        />
        {error ? (
          <p className="signin__alert" role="alert">
            <Icon glyph={glyph.error} />
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
