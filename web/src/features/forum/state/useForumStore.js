import { useCallback, useMemo } from 'react';
import { useLocalStorage } from '../../../state';
import { buildForum } from '../lib/model';
import {
  EMPTY_STATE, FORUM_KEY, addReply, addThread, landPending, makeReply, makeThread, normalizeState, setAccepted, toggleVote,
} from '../lib/store';

/**
 * The forum store: seed threads merged with the student's own activity, persisted with
 * useLocalStorage (so every page and widget using it stays in sync, in this tab and others).
 * Use it through <ForumProvider> + useForum(); this hook is the provider's engine.
 */
export function useForumStore() {
  const [raw, setRaw] = useLocalStorage(FORUM_KEY, EMPTY_STATE);
  const state = useMemo(() => normalizeState(raw), [raw]);
  const data = useMemo(() => buildForum(state), [state]);

  const update = useCallback((fn) => setRaw((prev) => fn(normalizeState(prev))), [setRaw]);

  const actions = useMemo(
    () => ({
      /** Optimistic upvote toggle (there is no server: the store is the truth). */
      toggleThreadVote: (threadId) => update((s) => toggleVote(s, `t:${threadId}`)),
      toggleReplyVote: (replyId) => update((s) => toggleVote(s, `r:${replyId}`)),
      /** -> the new thread (synchronously). */
      postThread: (input) => {
        let created = null;
        update((s) => {
          const now = Date.now();
          created = makeThread(s, input, now);
          return addThread(s, created, now);
        });
        return created;
      },
      /** -> the new reply. */
      postReply: (input) => {
        let created = null;
        update((s) => {
          created = makeReply(s, input, Date.now());
          return addReply(s, created);
        });
        return created;
      },
      acceptReply: (threadId, replyId) => update((s) => setAccepted(s, threadId, replyId)),
      landPending: (pendingId) => update((s) => landPending(s, pendingId, Date.now())),
    }),
    [update],
  );

  return useMemo(() => ({ state, ...data, ...actions }), [state, data, actions]);
}
