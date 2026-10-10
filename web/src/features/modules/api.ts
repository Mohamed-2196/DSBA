// Modules data: a module's chapters and videos (GET /modules/{id}) and a signed-in student's lesson progress
// (/me/progress…). The catalogue itself is loaded once by state/modules.tsx (useModules()).
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { ModuleDetail, Progress, ProgressImport } from '../../api/types';

export const moduleKeys = {
  detail: (id: string) => ['modules', 'detail', id] as const,
};

export function moduleDetailQuery(id: string) {
  return {
    queryKey: moduleKeys.detail(id),
    queryFn: ({ signal }: { signal?: AbortSignal }): Promise<ModuleDetail> =>
      call(api.GET('/api/v1/modules/{module_id}', { params: { path: { module_id: id } }, signal })),
    // Lessons change when the content team edits the seed: rarely.
    staleTime: 10 * 60_000,
  };
}

/** A module with its chapters, videos and resources. */
export function useModule(id: string | null | undefined) {
  return useQuery({ ...moduleDetailQuery(id ?? ''), enabled: !!id });
}

// ── Progress (signed in) ──────────────────────────────────────────────────────

/** Per account, so one person's progress is never shown to the next one on this browser. */
export const progressKey = (userId: string) => ['progress', userId] as const;

export function fetchProgress(signal?: AbortSignal): Promise<Progress> {
  return call(api.GET('/api/v1/me/progress', { signal }));
}

export function putWatched(key: string, watched: boolean): Promise<Progress> {
  return call(api.PUT('/api/v1/me/progress/lessons/{lesson_key}', { params: { path: { lesson_key: key } }, body: { watched } }));
}

export function putResume(moduleId: string, chapter: number, video: number): Promise<Progress> {
  return call(api.PUT('/api/v1/me/progress/resume', { body: { moduleId, chapter, video } }));
}

export function deleteModuleProgress(moduleId: string): Promise<unknown> {
  return call(api.DELETE('/api/v1/me/progress/modules/{module_id}', { params: { path: { module_id: moduleId } } }));
}

export function importProgress(body: ProgressImport): Promise<Progress> {
  return call(api.POST('/api/v1/me/progress/import', { body }));
}

/** Prefetch a module's lessons (hovering a link to it, for instance). */
export function prefetchModule(qc: QueryClient, id: string) {
  return qc.prefetchQuery(moduleDetailQuery(id));
}
