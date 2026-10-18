// Career Navigator content from the API (GET /api/v1/career): one document, typed by the API (CareerDoc in
// src/api/types), so the page reads it as it comes (code quality review CQ-4). Links are still checked where they
// are drawn (lib/links.ts), so a link the API let through by mistake never becomes a button.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { CareerDoc, MySenior, Senior, SeniorUpdate } from '../../api/types';
import { useAuth } from '../../auth';
import { moduleDetailQuery } from '../modules/public';

export const CAREER_KEY = ['career'] as const;

/** The document, or null while it has nothing to show (before an admin loads it). */
const usable = (doc: CareerDoc | null): CareerDoc | null =>
  doc && (doc.employers.length || doc.roles.length || doc.certs.length) ? doc : null;

/** The Career Navigator's content; data is null when there is nothing to show yet. */
export function useCareer() {
  return useQuery({
    queryKey: CAREER_KEY,
    queryFn: async () => (await call(api.GET('/api/v1/career'))).data,
    select: usable,
    staleTime: 10 * 60_000,
  });
}

/** The employers as { id, name }: empty while there is nothing to show. */
export function useEmployers(enabled = true) {
  const career = useQuery({
    queryKey: CAREER_KEY,
    queryFn: async () => (await call(api.GET('/api/v1/career'))).data,
    select: (doc: CareerDoc | null) => (usable(doc)?.employers ?? []).map((e) => ({ id: e.id, name: e.name })),
    staleTime: 10 * 60_000,
    enabled,
  });
  return career.data ?? [];
}

/** A module with its chapters (for links straight to a lesson): the modules feature's one cache entry for it. */
export function useModuleDetail(moduleId: string | null | undefined) {
  return useQuery({ ...moduleDetailQuery(moduleId ?? ''), enabled: !!moduleId });
}

// ── Seniors who answer (career.seniors) ────────────────────────────────────────────────────────

export const SENIORS_KEY = [...CAREER_KEY, 'seniors'] as const;
export const MY_SENIOR_KEY = [...CAREER_KEY, 'seniors', 'me'] as const;

/** The Year 3 students taking questions (empty while the feature is off for this person). */
export function useSeniors(enabled: boolean) {
  return useQuery({
    queryKey: SENIORS_KEY,
    queryFn: () => call(api.GET('/api/v1/career/seniors')),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** The seniors listed now, for the panel and the section around it (empty while the feature is off). */
export function useListedSeniors(): Senior[] {
  const on = useAuth().featureOn('career.seniors');
  return useSeniors(on).data ?? [];
}

/** The signed-in person's listing, and whether they may have one (Year 3). */
export function useMySenior(enabled: boolean) {
  return useQuery({ queryKey: MY_SENIOR_KEY, queryFn: () => call(api.GET('/api/v1/career/seniors/me')), enabled });
}

export function useSaveSenior() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SeniorUpdate) => call(api.PUT('/api/v1/career/seniors/me', { body })),
    onSuccess: (mine) => {
      qc.setQueryData<MySenior>(MY_SENIOR_KEY, mine);
      void qc.invalidateQueries({ queryKey: SENIORS_KEY, exact: true });
    },
  });
}

export function useRemoveSenior() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.DELETE('/api/v1/career/seniors/me')),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MY_SENIOR_KEY, exact: true });
      void qc.invalidateQueries({ queryKey: SENIORS_KEY, exact: true });
    },
  });
}
