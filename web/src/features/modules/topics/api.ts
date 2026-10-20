// Time stamps in recordings (IDEA-52).
//   POST   /api/v1/lesson-topics                          suggest a time and what the video covers there
//   GET    /api/v1/lesson-topics/mine?lessonId=           your own suggestions for a lesson
//   GET    /api/v1/content/lesson-topics?status=          the review queue (content.edit)
//   POST   /api/v1/content/lesson-topics/{id}/accept      show it beside the player, put right if need be
//   POST   /api/v1/content/lesson-topics/{id}/decline     decline with a reason
//   DELETE /api/v1/content/lesson-topics/{id}             take an accepted one off the video
// Accepted ones come with the module (GET /modules/{id}: each lesson's `topics`).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../../api/client';
import { ADMIN_STATS_KEY } from '../../../api/keys';
import { nextOffset } from '../../../api/paging';
import type { TopicAccept, TopicCreate, TopicOut } from '../../../api/types';
import { moduleKeys } from '../api';
import type { SuggestionStatus } from '../suggestions/model';

const TOPICS_KEY = ['lesson-topics'] as const;
const PAGE_SIZE = 20;
const mineKey = (lessonId: string) => [...TOPICS_KEY, 'mine', lessonId] as const;
const queueKey = (status: SuggestionStatus) => [...TOPICS_KEY, 'queue', status] as const;

export function useMyTopics(lessonId: string, enabled: boolean) {
  return useQuery({
    queryKey: mineKey(lessonId),
    queryFn: ({ signal }) => call(api.GET('/api/v1/lesson-topics/mine', { params: { query: { lessonId } }, signal })),
    enabled,
  });
}

export function useSuggestTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TopicCreate) => call(api.POST('/api/v1/lesson-topics', { body })),
    onSuccess: (made: TopicOut) => {
      qc.setQueryData<TopicOut[]>(mineKey(made.lessonId), (list) => [made, ...(list ?? [])]);
      void qc.invalidateQueries({ queryKey: [...TOPICS_KEY, 'queue'] });
    },
  });
}

export function useTopicQueue(status: SuggestionStatus) {
  return useInfiniteQuery({
    queryKey: queueKey(status),
    queryFn: ({ pageParam, signal }) =>
      call(
        api.GET('/api/v1/content/lesson-topics', {
          params: { query: { status, limit: PAGE_SIZE, offset: pageParam } },
          signal,
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

/** After a decision: the queues, Manage's count, and the module students see. */
function decided(qc: QueryClient, moduleId: string): void {
  void qc.invalidateQueries({ queryKey: [...TOPICS_KEY, 'queue'] });
  void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
  void qc.invalidateQueries({ queryKey: moduleKeys.detail(moduleId) });
}

export function useAcceptTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TopicAccept }) =>
      call(api.POST('/api/v1/content/lesson-topics/{topic_id}/accept', { params: { path: { topic_id: id } }, body })),
    onSuccess: (t: TopicOut) => decided(qc, t.moduleId),
  });
}

export function useDeclineTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      call(
        api.POST('/api/v1/content/lesson-topics/{topic_id}/decline', {
          params: { path: { topic_id: id } },
          body: { reply },
        }),
      ),
    onSuccess: (t: TopicOut) => decided(qc, t.moduleId),
  });
}

export function useRemoveTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; moduleId: string }) =>
      call(api.DELETE('/api/v1/content/lesson-topics/{topic_id}', { params: { path: { topic_id: id } } })),
    onSuccess: (_, { moduleId }) => decided(qc, moduleId),
  });
}
