import type { Reply } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useToast } from '../../../state';
import { useModerateReply } from '../api';

/** A student rep's actions on a reply (hide with a reason for its author, unhide), each with its toast. */
export function useReplyModeration(reply: Pick<Reply, 'id'>) {
  const moderate = useModerateReply();
  const { push } = useToast();

  return {
    pending: moderate.isPending,
    /** what went wrong with the last hide (its dialog shows it) */
    hideError:
      moderate.isError && moderate.variables?.change.status === 'hidden'
        ? errorMessage(moderate.error, 'The reply wasn’t hidden. Try again.')
        : null,
    reset: moderate.reset,
    hide: (reason: string | null, onDone: () => void) =>
      moderate.mutate(
        { replyId: reply.id, change: { status: 'hidden', reason } },
        {
          onSuccess: () => {
            onDone();
            push({
              title: 'Reply hidden',
              body: 'Only student reps can see it now. Resolve the report in Manage if there is one.',
              tone: 'success',
            });
          },
        },
      ),
    unhide: () =>
      moderate.mutate(
        { replyId: reply.id, change: { status: 'visible' } },
        {
          onSuccess: (r) =>
            push(
              r.status === 'deleted'
                ? {
                    title: 'Reply shown as deleted',
                    body: 'Its text was deleted while it was hidden, so it keeps its place without it.',
                    tone: 'info',
                  }
                : { title: 'Reply visible again', tone: 'success' },
            ),
          onError: (e) => push({ title: 'That didn’t work', body: errorMessage(e), tone: 'alert' }),
        },
      ),
  };
}
