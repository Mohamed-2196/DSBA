// Suggested videos.
//   POST /api/v1/video-suggestions                            suggest a video for a chapter (signed in, active)
//   GET  /api/v1/video-suggestions/mine?moduleId=             your own suggestions
//   GET  /api/v1/content/video-suggestions?status=            the review queue (content.edit)
//   POST /api/v1/content/video-suggestions/{id}/accept        add it as a lesson (content.edit)
//   POST /api/v1/content/video-suggestions/{id}/decline       decline with a reason (content.edit)
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../../api/client';
import { ADMIN_STATS_KEY } from '../../../api/keys';
import { nextOffset } from '../../../api/paging';
import type { SuggestionAccept, SuggestionCreate, SuggestionOut } from '../../../api/types';
import { MODULES_KEY } from '../../../state/modules';
import { moduleKeys } from '../api';
import { EDIT_MODULES_KEY } from '../editor/api';
import type { SuggestionStatus } from './model';

const SUGGESTIONS_KEY = ['video-suggestions'] as const;
const PAGE_SIZE = 20;
const mineKey = (moduleId: string) => [...SUGGESTIONS_KEY, 'mine', moduleId] as const;
const queueKey = (status: SuggestionStatus) => [...SUGGESTIONS_KEY, 'queue', status] as const;

export function useMySuggestions(moduleId: string, enabled: boolean) {
  return useQuery({
    queryKey: mineKey(moduleId),
    queryFn: ({ signal }) =>
      call(api.GET('/api/v1/video-suggestions/mine', { params: { query: { moduleId } }, signal })),
    enabled,
  });
}

export function useSuggestVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SuggestionCreate) => call(api.POST('/api/v1/video-suggestions', { body })),
    onSuccess: (made: SuggestionOut) => {
      qc.setQueryData<SuggestionOut[]>(mineKey(made.moduleId), (list) => [made, ...(list ?? [])]);
      void qc.invalidateQueries({ queryKey: [...SUGGESTIONS_KEY, 'queue'] });
    },
  });
}

export function useSuggestionQueue(status: SuggestionStatus) {
  return useInfiniteQuery({
    queryKey: queueKey(status),
    queryFn: ({ pageParam, signal }) =>
      call(
        api.GET('/api/v1/content/video-suggestions', {
          params: { query: { status, limit: PAGE_SIZE, offset: pageParam } },
          signal,
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

/** After a decision: the queue and its count, and, for a new lesson, what students and editors see of the module. */
function decided(qc: QueryClient, s: SuggestionOut): void {
  void qc.invalidateQueries({ queryKey: [...SUGGESTIONS_KEY, 'queue'] });
  void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
  if (s.status !== 'accepted') return;
  void qc.invalidateQueries({ queryKey: MODULES_KEY, exact: true });
  void qc.invalidateQueries({ queryKey: moduleKeys.detail(s.moduleId) });
  // The editor keeps its own copy and starts a new draft when it loads: it loads again next time it opens.
  void qc.invalidateQueries({ queryKey: EDIT_MODULES_KEY, refetchType: 'none' });
}

export function useAcceptSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SuggestionAccept }) =>
      call(
        api.POST('/api/v1/content/video-suggestions/{suggestion_id}/accept', {
          params: { path: { suggestion_id: id } },
          body,
        }),
      ),
    onSuccess: (s: SuggestionOut) => decided(qc, s),
  });
}

export function useDeclineSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      call(
        api.POST('/api/v1/content/video-suggestions/{suggestion_id}/decline', {
          params: { path: { suggestion_id: id } },
          body: { reply },
        }),
      ),
    onSuccess: (s: SuggestionOut) => decided(qc, s),
  });
}
