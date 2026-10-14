// The votes each poll of the issue being edited has: a poll with votes keeps its answers (the API refuses a change
// with 409 poll_has_votes), so the editor locks them.
import { createContext, useContext } from 'react';
import type { PollResult } from '../../../api/types';

export const PollVotesContext = createContext<Record<string, PollResult>>({});

/** Whether the poll `id` has votes, as the issue was last loaded. */
export function useHasVotes(id: string): boolean {
  return (useContext(PollVotesContext)[id]?.total ?? 0) > 0;
}
