// The signed-in person's account: profile, sign-in methods, sessions, export and deletion.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ACCOUNT_KEY } from '../../api/keys';
import type { MeUpdate, SessionInfo } from '../../api/types';
import { ME_KEY } from '../../auth';

export const SESSIONS_KEY = [...ACCOUNT_KEY, 'sessions'] as const;

export type IdentifierKind = 'email' | 'phone';

export function useSessions(enabled: boolean) {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => call(api.GET('/api/v1/me/sessions')),
    enabled,
  });
}

/** PATCH /me; the cache gets the answer. */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MeUpdate) => call(api.PATCH('/api/v1/me', { body })),
    onSuccess: (me) => qc.setQueryData(ME_KEY, me),
  });
}

/** Removing (or adding, or changing) a way to sign in signs out the account's other devices on the server. */
export function useRemoveIdentifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: IdentifierKind) =>
      call(api.DELETE('/api/v1/me/identifiers/{kind}', { params: { path: { kind } } })),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      void qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}

export function useRevokeSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await call(api.DELETE('/api/v1/me/sessions/{session_id}', { params: { path: { session_id: id } } }));
      }
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: SESSIONS_KEY });
      const before = qc.getQueryData<SessionInfo[]>(SESSIONS_KEY);
      if (before)
        qc.setQueryData<SessionInfo[]>(
          SESSIONS_KEY,
          before.filter((s) => !ids.includes(s.id)),
        );
      return { before };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.before) qc.setQueryData(SESSIONS_KEY, ctx.before);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

/** GET /me/export, saved as a JSON file. */
export async function downloadAccountData(): Promise<void> {
  const data = await call(api.GET('/api/v1/me/export'));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dsba-hub-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function deleteAccount(): Promise<void> {
  await call(api.DELETE('/api/v1/me'));
}
