// The catalogue's provider and gate (the catalogue itself and its hooks: state/modules.ts).
import { useContext, useMemo, type ReactNode } from 'react';
import { ModulesContext, useModulesQuery, type ModulesState, type ModulesValue } from './modules';

/** Loads the catalogue for the whole app without holding anything up. */
export function ModulesProvider({ children }: { children: ReactNode }) {
  const q = useModulesQuery();
  const { data, isError, error, isFetching, refetch } = q;
  const value = useMemo<ModulesValue | null>(() => {
    if (!data) return null;
    const list = data;
    const byId = new Map(list.map((m) => [m.id, m]));
    const byCode = new Map(list.filter((m) => m.unitCode).map((m) => [m.unitCode as string, m]));
    return {
      modules: list,
      getModule: (id) => (id ? (byId.get(id) ?? null) : null),
      getModuleByUnitCode: (code) => (code ? (byCode.get(code) ?? null) : null),
      getModulesForYear: (year) => (year == null ? list : list.filter((m) => m.year === Number(year))),
    };
  }, [data]);
  const state = useMemo<ModulesState>(
    () => ({ value, error: !value && isError ? error : null, retry: () => void refetch(), retrying: isFetching }),
    [value, isError, error, isFetching, refetch],
  );
  return <ModulesContext.Provider value={state}>{children}</ModulesContext.Provider>;
}

export interface ModulesGateProps {
  children: ReactNode;
  /** while the catalogue loads (a page: its loader; an overlay: nothing) */
  fallback?: ReactNode;
  /** when it can't be loaded; nothing by default */
  error?: (retry: () => void, error: unknown, retrying: boolean) => ReactNode;
}

/** Renders `children` once the catalogue is loaded, so everything inside can call useModules(). */
export function ModulesGate({ children, fallback = null, error }: ModulesGateProps) {
  const state = useContext(ModulesContext);
  if (!state) throw new Error('<ModulesGate> must be used inside <ModulesProvider>');
  if (state.value) return <>{children}</>;
  if (state.error) return <>{error ? error(state.retry, state.error, state.retrying) : null}</>;
  return <>{fallback}</>;
}
