// Requests from students.
//   GET    /api/v1/requests                       the list (filters, sort, mine), own requests first
//   GET    /api/v1/requests/done?until=           "You asked, we did": done in the 30 days up to a day (requests.done)
//   GET    /api/v1/requests/similar?q=            "Similar requests" while a title is typed
//   GET    /api/v1/requests/{id}                  one request
//   POST   /api/v1/requests                       ask (signed in, active)
//   PUT    /api/v1/requests/{id}/me-too           me too; DELETE takes it back
//   POST   /api/v1/requests/{id}/answer           status + public reply (requests.manage)
//   POST   /api/v1/requests/{id}/found            yes or no to the file found for it (the requester or requests.manage)
//   DELETE /api/v1/requests/{id}                  remove (requests.manage)
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ADMIN_STATS_KEY } from '../../api/keys';
import { nextOffset } from '../../api/paging';
import type { RequestAnswer, RequestCreate, RequestOut, RequestPage } from '../../api/types';
import type { RequestFilters } from './types';

export const REQUESTS_KEY = ['requests'] as const;
const PAGE_SIZE = 20;
/** The shortest title worth looking for similar requests. */
export const SIMILAR_MIN = 4;

const listKey = (filters: RequestFilters) => [...REQUESTS_KEY, 'list', filters] as const;
const oneKey = (id: string) => [...REQUESTS_KEY, 'one', id] as const;

export function useRequests(filters: RequestFilters, { enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: listKey(filters),
    queryFn: ({ pageParam }) =>
      call(
        api.GET('/api/v1/requests', {
          params: {
            query: {
              kind: filters.kind ?? undefined,
              status: filters.status ?? undefined,
              sort: filters.sort,
              mine: filters.mine || undefined,
              limit: PAGE_SIZE,
              offset: pageParam,
            },
          },
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    placeholderData: (previous) => previous,
    enabled,
  });
}

/** "You asked, we did": the requests done in the 30 days up to `until` (today by default), the latest first. */
export function useDoneRequests({ until, limit, enabled = true }: { until?: string; limit: number; enabled?: boolean }) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, 'done', until ?? null, limit] as const,
    queryFn: () => call(api.GET('/api/v1/requests/done', { params: { query: { until, limit } } })),
    enabled,
  });
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: oneKey(id ?? ''),
    queryFn: () =>
      call(
        api.GET('/api/v1/requests/{request_id}', {
          params: { path: { request_id: id ?? '' } },
        }),
      ),
    enabled: !!id,
  });
}

export function useSimilarRequests(q: string) {
  const text = q.trim();
  return useQuery({
    queryKey: [...REQUESTS_KEY, 'similar', text] as const,
    queryFn: () => call(api.GET('/api/v1/requests/similar', { params: { query: { q: text } } })),
    enabled: text.length >= SIMILAR_MIN,
    staleTime: 30_000,
  });
}

type Pages = InfiniteData<RequestPage, number>;

/** Puts a request's new state into every cached list and its own page. */
function patchRequest(qc: QueryClient, id: string, change: (r: RequestOut) => RequestOut) {
  qc.setQueriesData<Pages>({ queryKey: [...REQUESTS_KEY, 'list'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.map((r) => (r.id === id ? change(r) : r)),
          })),
        }
      : data,
  );
  qc.setQueryData<RequestOut>(oneKey(id), (r) => (r ? change(r) : r));
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RequestCreate) => call(api.POST('/api/v1/requests', { body })),
    onSuccess: (made) => {
      qc.setQueryData(oneKey(made.id), made);
      void qc.invalidateQueries({ queryKey: REQUESTS_KEY });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}

/** "Me too", or taking it back: the button changes at once and a failure puts it back. */
export function useMeToo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => {
      const params = { params: { path: { request_id: id } } };
      return call(on ? api.PUT('/api/v1/requests/{request_id}/me-too', params) : api.DELETE('/api/v1/requests/{request_id}/me-too', params));
    },
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: REQUESTS_KEY });
      const lists = qc.getQueriesData<Pages>({
        queryKey: [...REQUESTS_KEY, 'list'],
      });
      const one = qc.getQueryData<RequestOut>(oneKey(id));
      patchRequest(qc, id, (r) =>
        r.meToo === on
          ? r
          : {
              ...r,
              meToo: on,
              meTooCount: Math.max(0, r.meTooCount + (on ? 1 : -1)),
            },
      );
      return { lists, one };
    },
    onError: (_e, { id }, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.one) qc.setQueryData(oneKey(id), ctx.one);
    },
    onSuccess: (fresh) => patchRequest(qc, fresh.id, () => fresh),
  });
}

export function useAnswerRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RequestAnswer }) =>
      call(
        api.POST('/api/v1/requests/{request_id}/answer', {
          params: { path: { request_id: id } },
          body,
        }),
      ),
    onSuccess: (fresh) => {
      patchRequest(qc, fresh.id, () => fresh);
      void qc.invalidateQueries({ queryKey: [...REQUESTS_KEY, 'list'] });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}

/** Yes or no to the file found for a paper request: yes closes it as done, no keeps it open. */
export function useAnswerFound() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) =>
      call(
        api.POST('/api/v1/requests/{request_id}/found', {
          params: { path: { request_id: id } },
          body: { confirm },
        }),
      ),
    onSuccess: (fresh) => {
      patchRequest(qc, fresh.id, () => fresh);
      void qc.invalidateQueries({ queryKey: [...REQUESTS_KEY, 'list'] });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}

export function useRemoveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(
        api.DELETE('/api/v1/requests/{request_id}', {
          params: { path: { request_id: id } },
        }),
      ),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: oneKey(id) });
      void qc.invalidateQueries({ queryKey: [...REQUESTS_KEY, 'list'] });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}
