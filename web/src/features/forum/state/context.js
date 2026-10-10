import { createContext, useContext } from 'react';

export const ForumContext = createContext(null);

/**
 * { threads, byId, state, typing, toggleThreadVote, toggleReplyVote, postThread, postReply, acceptReply }
 * Must be used inside <ForumProvider> (every forum page and public widget renders one).
 */
export function useForum() {
  const ctx = useContext(ForumContext);
  if (!ctx) throw new Error('useForum must be used inside <ForumProvider>');
  return ctx;
}
