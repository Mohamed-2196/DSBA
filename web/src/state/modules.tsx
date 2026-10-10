// The module catalogue, loaded once from the API and shared by every feature.
//   const { modules, getModule, getModulesForYear } = useModules();
// Module details (chapters and videos) are a separate query: features/modules/api.ts useModule(id).
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
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

const ModulesContext = createContext<ModulesValue | null>(null);

export function useModulesQuery() {
  return useQuery({
    queryKey: MODULES_KEY,
    queryFn: () => call(api.GET('/api/v1/modules')),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Renders `fallback` until the catalogue is loaded (it is small and every page needs it), and `error` if it
 * cannot be loaded, so the rest of the app can treat modules as synchronous data.
 */
export function ModulesProvider({
  children,
  fallback,
  error,
}: {
  children: ReactNode;
  fallback: ReactNode;
  error: (retry: () => void) => ReactNode;
}) {
  const q = useModulesQuery();
  const value = useMemo<ModulesValue | null>(() => {
    if (!q.data) return null;
    const list = q.data;
    const byId = new Map(list.map((m) => [m.id, m]));
    const byCode = new Map(list.filter((m) => m.unitCode).map((m) => [m.unitCode as string, m]));
    return {
      modules: list,
      getModule: (id) => (id ? (byId.get(id) ?? null) : null),
      getModuleByUnitCode: (code) => (code ? (byCode.get(code) ?? null) : null),
      getModulesForYear: (year) => (year == null ? list : list.filter((m) => m.year === Number(year))),
    };
  }, [q.data]);
  if (q.isError) return <>{error(() => void q.refetch())}</>;
  if (!value) return <>{fallback}</>;
  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules(): ModulesValue {
  const v = useContext(ModulesContext);
  if (!v) throw new Error('useModules() must be used inside <ModulesProvider>');
  return v;
}
