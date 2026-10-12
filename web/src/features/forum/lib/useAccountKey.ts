import { useState } from 'react';
import { useAuth } from '../../../auth';

/**
 * A key for a form that holds what someone typed: it changes when the signed-in account leaves (signing out, the
 * session ending, another account), so the form starts again empty and the next person on a shared computer never
 * sees the last one's text (code quality review CQ-1). A guest who signs in keeps what they wrote: that is how
 * "Post" carries on after signing in. Stored drafts are removed on sign-out by auth/queries.ts.
 */
export function useAccountKey(): number {
  const { me, status } = useAuth();
  const viewer = status === 'loading' ? undefined : (me?.id ?? null);
  const [seen, setSeen] = useState({ viewer, key: 0 });
  if (viewer !== undefined && seen.viewer !== viewer) {
    // Adjusting state while rendering (React's pattern for "a prop changed"): the form below never renders for the
    // next person with the last one's state.
    const accountLeft = typeof seen.viewer === 'string';
    setSeen({ viewer, key: accountLeft ? seen.key + 1 : seen.key });
  }
  return seen.key;
}
