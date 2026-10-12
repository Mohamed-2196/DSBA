// The module catalogue, loaded once from the API and shared by every feature.
//   const { modules, getModule, getModulesForYear } = useModules();
// Module details (chapters and videos) are a separate query: features/modules/api.ts useModule(id).
//
// Nothing waits for it but what needs it (code quality review CQ-17): <ModulesProvider> (state/ModulesProvider.tsx)
// starts loading it and renders the app at once; each page sits inside a <ModulesGate> (routes.tsx), which shows
// the page's loader until the catalogue is there, and the page's own "didn't load" state if it can't be loaded.
// So the shell, sign-in and the pages that don't need modules work even when GET /modules fails.
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { api, call } from '../api/client';
import type { ModuleSummary } from '../api/types';

export const MODULES_KEY = ['modules'] as const;

export interface ModulesValue {
  modules: ModuleSummary[];
  /** By id; null when unknown (or not loaded). */
  getModule: (id: string | null | undefined) => ModuleSummary | null;
  getModuleByUnitCode: (code: string | null | undefined) => ModuleSummary | null;
  /** A cohort's modules in catalogue order; all modules when year is null. */
  getModulesForYear: (year: number | null | undefined) => ModuleSummary[];
}

export interface ModulesState {
  /** the catalogue, once loaded */
  value: ModulesValue | null;
  /** why it couldn't be loaded (only while there is no catalogue) */
  error: unknown;
  retry: () => void;
  retrying: boolean;
}

/** Internal: what ModulesProvider shares (state/ModulesProvider.tsx). */
export const ModulesContext = createContext<ModulesState | null>(null);

export function useModulesQuery() {
  return useQuery({
    queryKey: MODULES_KEY,
    queryFn: () => call(api.GET('/api/v1/modules')),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** The catalogue. Only inside a <ModulesGate> (every page is in one): there it is always loaded. */
export function useModules(): ModulesValue {
  const value = useContext(ModulesContext)?.value;
  if (!value) throw new Error('useModules() must be used inside <ModulesGate>');
  return value;
}

/** The catalogue, or null while it isn't loaded (for primitives that also render without it). */
export function useModulesOptional(): ModulesValue | null {
  return useContext(ModulesContext)?.value ?? null;
}
