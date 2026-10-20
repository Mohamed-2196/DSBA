// "Delete this thread?" and "Delete this reply?": what deleting does (lib/deleting.ts), and the delete itself.
import { useNavigate } from 'react-router-dom';
import type { Reply, ThreadDetail } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { ConfirmDialog } from '../../../ui';
import { useToast } from '../../../state';
import { useDeleteReply, useDeleteThread } from '../api';
import { replyDeleteCopy, threadDeleteCopy } from '../lib/deleting';

export interface DeleteThreadDialogProps {
  thread: ThreadDetail;
  open: boolean;
  onClose: () => void;
}

/** A deleted thread leaves for the list; a hidden one stays on screen for the reps, hidden and without its text (SEC-15). */
export function DeleteThreadDialog({ thread, open, onClose }: DeleteThreadDialogProps) {
  const remove = useDeleteThread();
  const { push } = useToast();
  const navigate = useNavigate();
  const hidden = thread.status === 'hidden';
  return (
    <ConfirmDialog
      open={open}
      tone="danger"
      title="Delete this thread?"
      body={<p>{threadDeleteCopy(thread)}</p>}
      confirmLabel="Delete thread"
      busy={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, 'The thread wasn’t deleted. Try again.') : null}
      onClose={() => {
        onClose();
        remove.reset();
      }}
      onConfirm={() =>
        remove.mutate(
          { threadId: thread.id, slug: thread.slug, stay: hidden },
          {
            onSuccess: () => {
              onClose();
              if (hidden) {
                push({ title: 'Thread text deleted', body: 'The thread stays hidden.', tone: 'success' });
                return;
              }
              push({ title: 'Thread deleted', tone: 'success' });
              navigate('/forum');
            },
          },
        )
      }
    />
  );
}

export interface DeleteReplyDialogProps {
  reply: Reply;
  /** replies sit under it: they stay, under a "Deleted reply" note */
  hasReplies: boolean;
  open: boolean;
  onClose: () => void;
}

export function DeleteReplyDialog({ reply, hasReplies, open, onClose }: DeleteReplyDialogProps) {
  const remove = useDeleteReply();
  const { push } = useToast();
  const hidden = reply.status === 'hidden';
  return (
    <ConfirmDialog
      open={open}
      tone="danger"
      title="Delete this reply?"
      body={<p>{replyDeleteCopy(reply, hasReplies)}</p>}
      confirmLabel="Delete reply"
      busy={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, 'The reply wasn’t deleted. Try again.') : null}
      onClose={() => {
        onClose();
        remove.reset();
      }}
      onConfirm={() =>
        remove.mutate(
          { replyId: reply.id },
          {
            onSuccess: () => {
              onClose();
              push(
                hidden
                  ? { title: 'Reply text deleted', body: 'The reply stays hidden.', tone: 'success' }
                  : { title: 'Reply deleted', tone: 'success' },
              );
            },
          },
        )
      }
    />
  );
}
