import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { api, call } from '../api/client';
import { ApiError } from '../api/errors';
import type { Me } from '../api/types';
import { AuthContext, type AuthValue, type SignInRequest } from './context';
import { SignInDialog } from './SignInDialog';

export const ME_KEY = ['me'] as const;

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

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
  }, [qc]);

  const signOut = useCallback(async () => {
    try {
      await call(api.POST('/api/v1/auth/logout'));
    } finally {
      qc.setQueryData(ME_KEY, null);
      // everything personal (stars, votes, notifications) must be re-read as a guest
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    }
  }, [qc]);

  const openSignIn = useCallback((req: SignInRequest = {}) => setRequest(req), []);

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
      <SignInDialog request={request} onClose={() => setRequest(null)} />
    </AuthContext.Provider>
  );
}
