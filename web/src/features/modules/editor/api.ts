// The module editor's data (content managers): every module with its version, one module as the editor has it, and
// the writes. A write also refreshes what students see: the catalogue and the module's lessons.
import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../../api/client';
import type { ModuleCreate, ModuleEdit, ModuleOrder, ModuleSave } from '../../../api/types';
import { MODULES_KEY } from '../../../state/modules';
import { moduleKeys } from '../api';

export const EDIT_MODULES_KEY = ['content', 'modules'] as const;
const editKey = (id: string) => [...EDIT_MODULES_KEY, id] as const;

function changed(qc: QueryClient, id?: string): void {
  void qc.invalidateQueries({ queryKey: EDIT_MODULES_KEY, exact: true });
  void qc.invalidateQueries({ queryKey: MODULES_KEY, exact: true });
  if (id) void qc.invalidateQueries({ queryKey: moduleKeys.detail(id) });
}

export function useModulesForEditing() {
  return useQuery({
    queryKey: EDIT_MODULES_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/content/modules', { signal })),
  });
}

const editModuleQuery = (id: string) =>
  queryOptions({
    queryKey: editKey(id),
    queryFn: ({ signal }) =>
      call(api.GET('/api/v1/content/modules/{module_id}', { params: { path: { module_id: id } }, signal })),
    // The editor keeps its own copy: a refetch in the background must not look like someone else's save.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export function useModuleForEditing(id: string) {
  return useQuery(editModuleQuery(id));
}

export function useCreateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ModuleCreate) => call(api.POST('/api/v1/content/modules', { body })),
    onSuccess: (m: ModuleEdit) => {
      qc.setQueryData(editKey(m.id), m);
      changed(qc);
    },
  });
}

export function useSaveModule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ModuleSave) =>
      call(api.PUT('/api/v1/content/modules/{module_id}', { params: { path: { module_id: id } }, body })),
    onSuccess: (m: ModuleEdit) => {
      qc.setQueryData(editKey(id), m);
      changed(qc, id);
    },
  });
}

/** Loads the module again, as someone else saved it: the editor starts over from the copy it returns. */
export function useReloadModule(id: string) {
  const qc = useQueryClient();
  return () => qc.fetchQuery({ ...editModuleQuery(id), staleTime: 0 });
}

export function useReorderModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ModuleOrder) => call(api.POST('/api/v1/content/modules/reorder', { body })),
    onSuccess: (list) => {
      qc.setQueryData(EDIT_MODULES_KEY, list);
      void qc.invalidateQueries({ queryKey: MODULES_KEY, exact: true });
    },
    onError: () => void qc.invalidateQueries({ queryKey: EDIT_MODULES_KEY, exact: true }),
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      call(
        api.DELETE('/api/v1/content/modules/{module_id}', { params: { path: { module_id: id }, query: { version } } }),
      ),
    onSuccess: (_, { id }) => {
      qc.removeQueries({ queryKey: editKey(id), exact: true });
      changed(qc, id);
    },
  });
}
