// Career Navigator content from the API (GET /api/v1/career): one document, typed by the API (CareerDoc in
// src/api/types), so the page reads it as it comes (code quality review CQ-4). Links are still checked where they
// are drawn (lib/links.ts), so a link the API let through by mistake never becomes a button.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { CareerDoc } from '../../api/types';
import { moduleDetailQuery } from '../modules/public';

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

/** A module with its chapters (for links straight to a lesson): the modules feature's one cache entry for it. */
export function useModuleDetail(moduleId: string | null | undefined) {
  return useQuery({ ...moduleDetailQuery(moduleId ?? ''), enabled: !!moduleId });
}
