// The Access screen's data: roles, people's roles and the switches. Changes to roles also change the people list's
// role names, /me (an admin may edit a role they hold) and the activity log.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ACCESS_ROLES_KEY } from '../../api/keys';
import type { RoleCreate, RoleUpdate } from '../../api/types';
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
