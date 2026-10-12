import { useState } from 'react';
import type { UserPublic } from '../../../api/types';
import { useAuth } from '../../../auth';
import { ConfirmDialog, TextArea } from '../../../ui';
import { useMediaQuery } from '../../../state';
import { authorName } from '../lib/authors';
import { REASON_MAX, remainingNote } from '../lib/threadForm';

export interface HideDialogProps {
  open: boolean;
  what: 'thread' | 'reply';
  /** who wrote it: they are told, with the reason (decision D3) */
  author: UserPublic | null;
  busy: boolean;
  error: string | null;
  /** reason: null when the rep gave none */
  onConfirm: (reason: string | null) => void;
  onClose: () => void;
}

/**
 * A student rep hides a thread or a reply: what that does, and an optional reason that goes to the author in their
 * notification (and into the activity log). Hiding can be undone, so the confirm button is not a "danger" one.
 */
export function HideDialog({ open, what, author, busy, error, onConfirm, onClose }: HideDialogProps) {
  const { me } = useAuth();
  const [reason, setReason] = useState('');
  // Each time it opens, it starts without a reason.
  const [shown, setShown] = useState(open);
  if (shown !== open) {
    setShown(open);
    if (open) setReason('');
  }
  // A keyboard user starts in the reason field; on a phone, the keyboard would cover the dialog, so it waits.
  const finePointer = useMediaQuery('(pointer: fine)');
  const name = author ? authorName(author) : null;
  // Nobody is told when a rep hides their own post, or a post of a deleted account.
  const toldBy = author && author.id !== me?.id ? name : null;
  const count = remainingNote(reason.length, REASON_MAX);
  const hint = toldBy ? `Optional. ${toldBy} sees it in the notification; it also goes into the activity log.` : 'Optional. It goes into the activity log.';

  return (
    <ConfirmDialog
      open={open}
      title={what === 'thread' ? 'Hide this thread?' : 'Hide this reply?'}
      body={
        <p>
          {what === 'thread'
            ? 'Only student reps and admins will see it, and it can’t take replies.'
            : 'Only student reps and admins will see it, and the notifications about it are taken back.'}{' '}
          {toldBy
            ? what === 'thread'
              ? `${toldBy} can still open it, with a note that a student rep hid it, and gets a notification. `
              : `${toldBy} still sees it in the thread, marked as hidden, and gets a notification. `
            : ''}
          You can unhide it later.
        </p>
      }
      confirmLabel={what === 'thread' ? 'Hide thread' : 'Hide reply'}
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={() => onConfirm(reason.trim() || null)}
    >
      <TextArea
        label="Reason"
        hint={count ? `${hint} ${count}` : hint}
        rows={2}
        maxLength={REASON_MAX}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        dir="auto"
        data-autofocus={finePointer ? true : undefined}
        data-hub="hide-reason"
      />
    </ConfirmDialog>
  );
}
