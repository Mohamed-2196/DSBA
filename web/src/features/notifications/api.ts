// Notifications of the signed-in person: newest first, polled every minute while signed in.
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { NotificationOut, NotificationPage } from '../../api/types';

export const NOTIFICATIONS_KEY = ['notifications'] as const;
const PAGE_SIZE = 20;
const POLL_MS = 60_000;

type Pages = InfiniteData<NotificationPage, number>;

export function useNotifications(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: ({ pageParam }) => call(api.GET('/api/v1/notifications', { params: { query: { limit: PAGE_SIZE, offset: pageParam } } })),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined),
    enabled,
    refetchInterval: enabled ? POLL_MS : false,
    staleTime: 20_000,
  });
}

/** Apply a change to every cached notification, and set the unread count. */
function patchCache(qc: ReturnType<typeof useQueryClient>, change: (n: NotificationOut) => NotificationOut, unread: (count: number) => number) {
  qc.setQueryData<Pages>(NOTIFICATIONS_KEY, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => ({ ...p, unreadCount: Math.max(0, unread(p.unreadCount)), items: p.items.map(change) })),
        }
      : data,
  );
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(api.POST('/api/v1/notifications/{notification_id}/read', { params: { path: { notification_id: id } } })),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const before = qc.getQueryData<Pages>(NOTIFICATIONS_KEY);
      const wasUnread = before?.pages.some((p) => p.items.some((n) => n.id === id && !n.readAt)) ?? false;
      const now = new Date().toISOString();
      patchCache(qc, (n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n), (c) => (wasUnread ? c - 1 : c));
      return { before };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.before) qc.setQueryData(NOTIFICATIONS_KEY, ctx.before);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call(api.POST('/api/v1/notifications/read-all')),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const before = qc.getQueryData<Pages>(NOTIFICATIONS_KEY);
      const now = new Date().toISOString();
      patchCache(qc, (n) => (n.readAt ? n : { ...n, readAt: now }), () => 0);
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(NOTIFICATIONS_KEY, ctx.before);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
