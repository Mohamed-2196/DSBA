// An admin makes a one-time link for someone who forgot their password (the Hub sends no email): it works once,
// within an hour, and making another retires it. Audited, and the person is told.
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { AdminUser, ResetLinkOut } from '../../api/types';
import { copyText } from '../../lib/share';
import { Button, Icon, Modal, TextField, formatDate, glyph } from '../../ui';
import { useMakeResetLink } from './api';

export function ResetLinkDialog({ person, onClose }: { person: AdminUser | null; onClose: () => void }) {
  const make = useMakeResetLink();
  const [link, setLink] = useState<ResetLinkOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const name = person?.displayName || person?.email || 'this person';

  useEffect(() => {
    setLink(null);
    setError(null);
    setCopied(false);
  }, [person?.id]);

  const create = () => {
    if (!person) return;
    setError(null);
    make.mutate(person.id, { onSuccess: setLink, onError: (e) => setError(errorMessage(e)) });
  };

  return (
    <Modal
      open={person !== null}
      onClose={onClose}
      title={`A reset link for ${name}`}
      description={
        link
          ? 'Pass it on to them yourself, in person or by message. Anyone holding it can set the password.'
          : 'They open it and choose a new password. It works once, within an hour, and signs them out everywhere else.'
      }
      size="sm"
      data-hub="reset-link"
      footer={
        link ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={make.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} loading={make.isPending}>
              Make the link
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="people-reset">
          <TextField label="Reset link" value={link.url} readOnly onFocus={(e) => e.currentTarget.select()} />
          <Button
            leadingIcon={<Icon glyph={copied ? glyph.check : glyph.copy} />}
            onClick={() => void copyText(link.url).then(setCopied)}
          >
            {copied ? 'Copied' : 'Copy the link'}
          </Button>
          <p className="people-muted">
            It stops working at{' '}
            {formatDate(link.expiresAt, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="people-error" role="alert">
          <Icon glyph={glyph.error} />
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
