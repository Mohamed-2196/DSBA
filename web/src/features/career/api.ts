// Career Navigator content from the API (GET /api/v1/career): one document, typed by the API (CareerDoc in
// src/api/types), so the page reads it as it comes (code quality review CQ-4). Links are still checked where they
// are drawn (lib/links.ts), so a link the API let through by mistake never becomes a button.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { CareerDoc, ModuleDetail } from '../../api/types';

export const CAREER_KEY = ['career'] as const;

/** The document, or null while it has nothing to show (before an admin loads it). */
const usable = (doc: CareerDoc | null): CareerDoc | null => (doc && (doc.employers.length || doc.roles.length || doc.certs.length) ? doc : null);

/** The Career Navigator's content; data is null when there is nothing to show yet. */
export function useCareer() {
  return useQuery({
    queryKey: CAREER_KEY,
    queryFn: async () => (await call(api.GET('/api/v1/career'))).data,
    select: usable,
    staleTime: 10 * 60_000,
  });
}

/** A module with its chapters (for links straight to a lesson). Shares its cache entry with other features. */
export function useModuleDetail(moduleId: string | null | undefined) {
  return useQuery({
    queryKey: ['modules', 'detail', moduleId ?? ''] as const,
    queryFn: (): Promise<ModuleDetail> => call(api.GET('/api/v1/modules/{module_id}', { params: { path: { module_id: moduleId ?? '' } } })),
    enabled: !!moduleId,
    staleTime: Infinity,
  });
}
