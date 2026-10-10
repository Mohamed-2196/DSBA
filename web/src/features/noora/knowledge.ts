// What Mini Noora reads to answer: every module's chapters and lessons (GET /modules/{id}, one request per module,
// made once the chat is first opened), the calendar from today on, and the student's first name.
import { useMemo } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { ModuleDetail } from '../../api/types';
import { useAuth } from '../../auth';
import { useModules } from '../../state/modules';
import { dayKeyFromToday, useCalendarEvents } from '../calendar/public';
import { buildKnowledge, type Knowledge } from './brain';

// The modules feature's cache entry for a module (['modules', 'detail', id]): lessons fetched here are already
// there when the student follows one of her links, and the other way round.
const detailQuery = (id: string) => ({
  queryKey: ['modules', 'detail', id] as const,
  queryFn: ({ signal }: { signal?: AbortSignal }): Promise<ModuleDetail> =>
    call(api.GET('/api/v1/modules/{module_id}', { params: { path: { module_id: id } }, signal })),
  staleTime: 10 * 60_000,
});

interface Details {
  byId: Map<string, ModuleDetail>;
  /** every request has answered (or failed) */
  settled: boolean;
}

// Module-level, so TanStack Query keeps the combined result until a query result changes.
function combine(results: UseQueryResult<ModuleDetail>[]): Details {
  const byId = new Map<string, ModuleDetail>();
  for (const r of results) if (r.data) byId.set(r.data.id, r.data);
  return { byId, settled: results.every((r) => !r.isPending) };
}

const firstNameOf = (name: string | null | undefined): string | null => name?.trim().split(/\s+/)[0] || null;

export interface KnowledgeState {
  knowledge: Knowledge;
  /** the lessons and the calendar have answered (or failed): answers will not get any better by waiting */
  ready: boolean;
}

export function useKnowledge(): KnowledgeState {
  const { modules } = useModules();
  const { me, status } = useAuth();
  const details = useQueries({ queries: modules.map((m) => detailQuery(m.id)), combine });
  const events = useCalendarEvents({ from: dayKeyFromToday() });
  const name = status === 'signed-in' ? firstNameOf(me?.displayName) : null;
  const eventList = events.data ?? null;
  const knowledge = useMemo(() => buildKnowledge(modules, details.byId, eventList, name), [modules, details.byId, eventList, name]);
  return { knowledge, ready: details.settled && !events.isPending };
}
