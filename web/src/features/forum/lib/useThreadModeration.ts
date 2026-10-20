import type { ThreadDetail, ThreadModeration } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useToast, type ToastInput } from '../../../state';
import { useModerateThread } from '../api';

/** A student rep's actions on a thread (pin, lock, hide with a reason, unhide), each with its toast. */
export function useThreadModeration(thread: Pick<ThreadDetail, 'id'>) {
  const moderate = useModerateThread();
  const { push } = useToast();

  const run = (change: ThreadModeration, done: Omit<ToastInput, 'tone'>, onDone?: () => void) => {
    moderate.mutate(
      { threadId: thread.id, change },
      {
        onSuccess: () => {
          onDone?.();
          push({ ...done, tone: 'success' });
        },
        onError: (e) => {
          // A hide runs from its dialog, which shows the problem itself.
          if (change.status !== 'hidden') push({ title: 'That didn’t work', body: errorMessage(e), tone: 'alert' });
        },
      },
    );
  };

  return {
    pending: moderate.isPending,
    /** what went wrong with the last hide (for its dialog) */
    hideError:
      moderate.isError && moderate.variables?.change.status === 'hidden'
        ? errorMessage(moderate.error, 'The thread wasn’t hidden. Try again.')
        : null,
    reset: moderate.reset,
    pin: (pinned: boolean) =>
      run(
        { pinned },
        pinned
          ? { title: 'Thread pinned', body: 'It now sits at the top of the forum.' }
          : { title: 'Thread unpinned' },
      ),
    lock: (locked: boolean) =>
      run(
        { locked },
        locked
          ? { title: 'Thread locked', body: 'No one can reply until you unlock it.' }
          : { title: 'Thread unlocked', body: 'People can reply again.' },
      ),
    hide: (reason: string | null, onDone: () => void) =>
      run(
        { status: 'hidden', reason },
        {
          title: 'Thread hidden',
          body: 'Only student reps can see it now. Resolve the report in Manage if there is one.',
        },
        onDone,
      ),
    unhide: () =>
      moderate.mutate(
        { threadId: thread.id, change: { status: 'visible' } },
        {
          onSuccess: (t) =>
            push(
              t.status === 'deleted'
                ? {
                    title: 'Thread shown as deleted',
                    body: 'Its text was deleted while it was hidden, so it comes back without it.',
                    tone: 'info',
                  }
                : { title: 'Thread visible again', body: 'Everyone can see it now.', tone: 'success' },
            ),
          onError: (e) => push({ title: 'That didn’t work', body: errorMessage(e), tone: 'alert' }),
        },
      ),
  };
}
