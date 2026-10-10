import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { api, call } from '../api/client';
import { ApiError } from '../api/errors';
import type { Me } from '../api/types';
import { useAccountYearSync } from '../state';
import { AuthContext, type AuthValue, type SignInRequest } from './context';
import { ME_KEY, clearPersonalStorage, resetPersonalQueries } from './queries';
import { SignInDialog } from './SignInDialog';

async function fetchMe(): Promise<Me | null> {
  try {
    return await call(api.GET('/api/v1/me'));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null; // a guest
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000 });
  const [request, setRequest] = useState<SignInRequest | null>(null);
  const me = meQuery.data ?? null;

  // A signed-in student's cohort is the year the Hub shows by default.
  useAccountYearSync(me?.year ?? null);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
  }, [qc]);

  const signOut = useCallback(async () => {
    try {
      await call(api.POST('/api/v1/auth/logout'));
    } catch (e) {
      // Already signed out (the session expired or was revoked elsewhere) is fine; anything else is not:
      // the session cookie would still work, so don't pretend.
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
    qc.setQueryData(ME_KEY, null);
    // Everything personal (stars, votes, notifications, drafts) is forgotten; what is on screen is re-read as a guest.
    clearPersonalStorage();
    await resetPersonalQueries(qc);
  }, [qc]);

  const openSignIn = useCallback((req: SignInRequest = {}) => setRequest(req), []);
  const closeSignIn = useCallback(() => setRequest(null), []);

  const value = useMemo<AuthValue>(() => {
    const ready = !!me && !me.needsProfile;
    return {
      me,
      status: meQuery.isPending ? 'loading' : me ? 'signed-in' : 'guest',
      isModerator: me?.role === 'moderator' || me?.role === 'admin',
      isAdmin: me?.role === 'admin',
      refresh,
      signOut,
      openSignIn,
      requireAuth: (reason, onSuccess) => {
        if (ready) return true;
        setRequest({ reason, onSuccess });
        return false;
      },
    };
  }, [me, meQuery.isPending, refresh, signOut, openSignIn]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInDialog request={request} onClose={closeSignIn} />
    </AuthContext.Provider>
  );
}
