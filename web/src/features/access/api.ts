// The Access screen's data: roles, people and their roles, the switches and the activity log. Changes to roles also
// change the people list's role names, /me (an admin may edit a role they hold) and the activity log.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ACCESS_FEATURES_KEY, ACCESS_ROLES_KEY, FEATURES_KEY } from '../../api/keys';
import { nextOffset } from '../../api/paging';
import type { AdminUser, AdminUserPage, AdminUserUpdate, FeatureOut, RoleCreate, RoleUpdate, SwitchUpdate } from '../../api/types';
import { ME_KEY } from '../../auth';

export const ADMIN_USERS_KEY = ['admin', 'users'] as const;
export const AUDIT_KEY = ['admin', 'audit'] as const;

export function rolesChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ACCESS_ROLES_KEY });
  void qc.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
  void qc.invalidateQueries({ queryKey: AUDIT_KEY });
  void qc.invalidateQueries({ queryKey: ME_KEY });
}

export function useRoleCatalogue() {
  return useQuery({ queryKey: ACCESS_ROLES_KEY, queryFn: () => call(api.GET('/api/v1/admin/roles')) });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoleCreate) => call(api.POST('/api/v1/admin/roles', { body })),
    onSuccess: () => rolesChanged(qc),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoleUpdate }) => call(api.PATCH('/api/v1/admin/roles/{role_id}', { params: { path: { role_id: id } }, body })),
    onSuccess: () => rolesChanged(qc),
    // A stale version: load the role again, so the admin edits what's there now.
    onError: () => void qc.invalidateQueries({ queryKey: ACCESS_ROLES_KEY }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/v1/admin/roles/{role_id}', { params: { path: { role_id: id } } })),
    onSuccess: () => rolesChanged(qc),
  });
}

const PAGE = 20;

export function usePeople(q: string, role: string | null, enabled: boolean) {
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

/** Every loaded people list gets the new row, and the activity log is read again. */
function putPerson(qc: QueryClient, person: AdminUser) {
  qc.setQueriesData<InfiniteData<AdminUserPage, number>>({ queryKey: ADMIN_USERS_KEY }, (data) =>
    data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((u) => (u.id === person.id ? person : u)) })) } : data,
  );
  void qc.invalidateQueries({ queryKey: AUDIT_KEY });
}

/** Suspend someone, or lift their suspension. */
export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: AdminUserUpdate }) =>
      call(api.PATCH('/api/v1/admin/users/{user_id}', { params: { path: { user_id: id } }, body: change })),
    onSuccess: (person) => putPerson(qc, person),
  });
}

/** The roles someone holds afterwards, exactly. */
export function useSetUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleIds }: { id: string; roleIds: string[] }) =>
      call(api.PUT('/api/v1/admin/users/{user_id}/roles', { params: { path: { user_id: id } }, body: { roleIds } })),
    onSuccess: (person) => {
      putPerson(qc, person);
      void qc.invalidateQueries({ queryKey: ADMIN_USERS_KEY }); // a list filtered by role may drop them
      void qc.invalidateQueries({ queryKey: ACCESS_ROLES_KEY }); // holder counts
    },
  });
}

export function useFeatureSwitches() {
  return useQuery({ queryKey: ACCESS_FEATURES_KEY, queryFn: () => call(api.GET('/api/v1/admin/features')) });
}

/** One feature's switch. The guest list of features and the activity log change with it. */
export function useSetSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feature, body }: { feature: FeatureOut['feature']; body: SwitchUpdate }) =>
      call(api.PUT('/api/v1/admin/features/{feature}', { params: { path: { feature } }, body })),
    onSuccess: (out) => {
      qc.setQueryData<FeatureOut[]>(ACCESS_FEATURES_KEY, (list) => list?.map((f) => (f.feature === out.feature ? out : f)));
      void qc.invalidateQueries({ queryKey: FEATURES_KEY });
      void qc.invalidateQueries({ queryKey: AUDIT_KEY });
    },
  });
}
