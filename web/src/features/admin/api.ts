// People (search, roles, suspension) and the audit log, for admins.
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { AdminUser, AdminUserPage, AdminUserUpdate } from '../../api/types';

export type Role = AdminUser['role'];

export const ADMIN_USERS_KEY = ['admin', 'users'] as const;
export const AUDIT_KEY = ['admin', 'audit'] as const;
const PAGE = 20;

const nextOffset = (last: { offset: number; items: unknown[]; total: number }) =>
  last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined;

export function usePeople(q: string, role: Role | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...ADMIN_USERS_KEY, { q, role }],
    queryFn: ({ pageParam }) =>
      call(api.GET('/api/v1/admin/users', { params: { query: { q: q || undefined, role: role ?? undefined, limit: PAGE, offset: pageParam } } })),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAudit(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: AUDIT_KEY,
    queryFn: ({ pageParam }) => call(api.GET('/api/v1/admin/audit', { params: { query: { limit: PAGE, offset: pageParam } } })),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled,
  });
}

/** Change a role or suspend/unsuspend; every cached list gets the new row, and the activity log is re-read. */
export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: AdminUserUpdate }) =>
      call(api.PATCH('/api/v1/admin/users/{user_id}', { params: { path: { user_id: id } }, body: change })),
    onSuccess: (person) => {
      qc.setQueriesData<InfiniteData<AdminUserPage, number>>({ queryKey: ADMIN_USERS_KEY }, (data) =>
        data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((u) => (u.id === person.id ? person : u)) })) } : data,
      );
      void qc.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
      void qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
  });
}
