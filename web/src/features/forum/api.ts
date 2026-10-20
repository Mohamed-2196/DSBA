// The forum's data: TanStack Query hooks over the API.
//   reads   GET /forum/meta, /forum/stats, /forum/threads (filters, search, pages), /forum/threads/hot,
//           /forum/threads/{slug}, /forum/threads/{id}/related; moderators: /admin/reports
//   writes  threads: create, edit, delete, vote, accept an answer, moderate (pin, lock, hide)
//           replies: create (one level of nesting), edit, delete, vote, moderate (hide)
//           reports: create; moderators resolve or dismiss them
// Votes are optimistic: every cached copy of the thread or reply changes at once, and rolls back with a toast when
// the server says no. Other writes update the thread they return and mark the lists stale.
// Who is asking decides the personal fields (voted, isMine, canEdit, hidden posts): signing in or out re-reads or
// resets every query of the app (auth/queries.ts), the forum's included.
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ApiError, errorMessage } from '../../api/errors';
import { ADMIN_STATS_KEY, NOTIFICATIONS_KEY } from '../../api/keys';
import { nextOffset } from '../../api/paging';
import type {
  FollowRequest,
  Reply,
  Senior,
  ReplyModeration,
  ReportCreate,
  ThreadCreate,
  ThreadDetail,
  ThreadModeration,
  ThreadPage,
  ThreadSummary,
  ThreadUpdate,
} from '../../api/types';
import { useAuth } from '../../auth';
import type { CohortYear } from '../../state';
import { useToast } from '../../state';
import { pickBelow } from './lib/helpBelow';
import { similarQuery } from './lib/search';
import type { ReportStatus, ThreadListParams } from './types';

// ── Keys ────────────────────────────────────────────────────────────────────────────────────────
// ['forum', <family>, ...]. The family says what the cached data looks like:
//   list → InfiniteData<ThreadPage>   hot | similar | related → ThreadSummary[]
//   thread → ThreadDetail             meta → ForumMeta  stats → ForumStats

const FORUM = 'forum';

function cleanParams(p: ThreadListParams): ThreadListParams {
  const out: ThreadListParams = { sort: p.sort ?? 'hot' };
  if (p.q?.trim()) out.q = p.q.trim();
  if (p.category) out.category = p.category;
  if (p.module_id) out.module_id = p.module_id;
  if (p.tag) out.tag = p.tag;
  if (p.year) out.year = p.year;
  if (p.unanswered) out.unanswered = true;
  if (p.yours) out.yours = true;
  if (p.paper) out.paper = p.paper;
  return out;
}

export const forumKeys = {
  all: [FORUM] as const,
  meta: [FORUM, 'meta'] as const,
  stats: [FORUM, 'stats'] as const,
  lists: [FORUM, 'list'] as const,
  list: (params: ThreadListParams, pageSize: number) => [FORUM, 'list', cleanParams(params), pageSize] as const,
  hot: (n: number, year: CohortYear | null) => [FORUM, 'hot', { n, year }] as const,
  below: (years: readonly CohortYear[], n: number) => [FORUM, 'below', { years, n }] as const,
  similar: (q: string) => [FORUM, 'similar', q] as const,
  threads: [FORUM, 'thread'] as const,
  thread: (slug: string) => [FORUM, 'thread', slug] as const,
  related: (threadId: string, n: number) => [FORUM, 'related', threadId, n] as const,
};

export const reportKeys = {
  all: ['reports'] as const,
  list: (status: ReportStatus) => ['reports', status] as const,
};

/** Everything that lists threads or counts them: stale after a write. */
const LIST_FAMILIES = new Set(['list', 'hot', 'similar', 'related', 'stats']);

function invalidateLists(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: forumKeys.all, predicate: (q) => LIST_FAMILIES.has(String(q.queryKey[1])) });
}

/** The reports queue shows what each reported post is now (Hidden, Deleted), and Manage counts it:
 *  both are stale after a post is hidden, shown again or deleted. */
function invalidateModeration(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: reportKeys.all });
  void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
}

export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

// ── Cache patching (optimistic votes, returned threads and replies) ─────────────────────────────

type ThreadPatch = <T extends ThreadSummary>(t: T) => T;

/** Apply `patch` to every cached copy of a thread: list pages, hot/similar/related lists and the thread itself. */
function patchThread(qc: QueryClient, id: string, patch: ThreadPatch): void {
  const one = <T extends ThreadSummary>(t: T): T => (t.id === id ? patch(t) : t);
  qc.setQueriesData<InfiniteData<ThreadPage, number>>({ queryKey: forumKeys.lists }, (data) =>
    data && data.pages.some((p) => p.items.some((t) => t.id === id))
      ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map(one) })) }
      : data,
  );
  for (const family of ['hot', 'similar', 'related'] as const) {
    qc.setQueriesData<ThreadSummary[]>({ queryKey: [FORUM, family] }, (data) =>
      data && data.some((t) => t.id === id) ? data.map(one) : data,
    );
  }
  qc.setQueriesData<ThreadDetail>({ queryKey: forumKeys.threads }, (data) =>
    data && data.id === id ? one(data) : data,
  );
}

/** Apply `patch` to a reply in whichever cached thread holds it. */
function patchReply(qc: QueryClient, replyId: string, patch: (r: Reply) => Reply): void {
  qc.setQueriesData<ThreadDetail>({ queryKey: forumKeys.threads }, (data) =>
    data && data.replies.some((r) => r.id === replyId)
      ? { ...data, replies: data.replies.map((r) => (r.id === replyId ? patch(r) : r)) }
      : data,
  );
}

/** Put a thread the API returned in the cache (and the copies of it in lists). */
function storeThread(qc: QueryClient, thread: ThreadDetail): void {
  qc.setQueryData(forumKeys.thread(thread.slug), thread);
  patchThread(qc, thread.id, (t) => ({ ...t, ...pickSummary(thread) }));
}

/** The summary fields of a detail (so list rows don't grow a body and replies). */
function pickSummary(d: ThreadDetail): Partial<ThreadSummary> {
  return {
    title: d.title,
    category: d.category,
    moduleId: d.moduleId,
    year: d.year,
    tags: d.tags,
    voteCount: d.voteCount,
    voted: d.voted,
    replyCount: d.replyCount,
    answered: d.answered,
    pinned: d.pinned,
    locked: d.locked,
    status: d.status,
    image: d.image,
    lastActivityAt: d.lastActivityAt,
  };
}

// Each vote gets a number; only the newest vote's answer may overwrite what the screen shows (a quick
// vote-unvote must not flicker back when the first answer arrives last).
const voteSeq = new Map<string, number>();
const nextVote = (key: string) => {
  const n = (voteSeq.get(key) ?? 0) + 1;
  voteSeq.set(key, n);
  return n;
};
const isLatestVote = (key: string, n: number) => voteSeq.get(key) === n;

function withVote<T extends { voted: boolean; voteCount: number }>(t: T, up: boolean): T {
  return t.voted === up ? t : { ...t, voted: up, voteCount: Math.max(0, t.voteCount + (up ? 1 : -1)) };
}

/** Voting for a thread or replying in it can start following it (on the server): read the thread again. */
function refreshFollow(qc: QueryClient, threadId: string): void {
  void qc.invalidateQueries({
    queryKey: forumKeys.threads,
    predicate: (q) => (q.state.data as ThreadDetail | undefined)?.id === threadId,
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────

/** Categories, tags, guidelines and tips. Moderators change them rarely: one load every ten minutes is plenty. */
export function useForumMeta() {
  return useQuery({
    queryKey: forumKeys.meta,
    queryFn: ({ signal }) => call(api.GET('/api/v1/forum/meta', { signal })),
    staleTime: 10 * 60_000,
  });
}

/** Counts for the tabs, chips and sidebar (over what a guest's list shows). */
export function useForumStats() {
  return useQuery({
    queryKey: forumKeys.stats,
    queryFn: ({ signal }) => call(api.GET('/api/v1/forum/stats', { signal })),
    staleTime: 60_000,
  });
}

function listQuery(params: ThreadListParams, offset: number, limit: number) {
  return { ...cleanParams(params), limit, offset };
}

/** A page-by-page thread list (pinned first when not searching, then by `sort`). */
export function useThreadList(
  params: ThreadListParams,
  { pageSize = 20, enabled = true }: { pageSize?: number; enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: forumKeys.list(params, pageSize),
    queryFn: ({ pageParam, signal }) =>
      call(api.GET('/api/v1/forum/threads', { params: { query: listQuery(params, pageParam, pageSize) }, signal })),
    initialPageParam: 0,
    getNextPageParam: (last: ThreadPage) => nextOffset(last),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Every thread of a list's loaded pages, once each (a thread can move between pages while you scroll). */
export function flattenPages(data: { pages: ThreadPage[] } | undefined): ThreadSummary[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: ThreadSummary[] = [];
  for (const page of data.pages) {
    for (const t of page.items) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/** The threads whose post or a reply links to a library item (/library/<slug>), newest first: a paper's page. */
export function usePaperThreads(slug: string, { n = 5, enabled = true }: { n?: number; enabled?: boolean } = {}) {
  const list = useThreadList({ paper: slug, sort: 'new' }, { pageSize: n, enabled: enabled && !!slug });
  const first = list.data?.pages[0];
  return {
    threads: first?.items ?? [],
    total: first?.total ?? 0,
    isPending: list.isPending,
    isError: list.isError,
    error: list.error,
    isFetching: list.isFetching,
    refetch: list.refetch,
  };
}

/** A module's newest threads (the module page's Overview): the first `n` of its "new" list, with the total. */
export function useModuleLatestThreads(
  moduleId: string,
  { n = 3, enabled = true }: { n?: number; enabled?: boolean } = {},
) {
  const list = useThreadList({ module_id: moduleId, sort: 'new' }, { pageSize: n, enabled: enabled && !!moduleId });
  const first = list.data?.pages[0];
  return {
    threads: first?.items ?? [],
    total: first?.total ?? 0,
    isPending: list.isPending,
    isError: list.isError,
    error: list.error,
    isFetching: list.isFetching,
    refetch: list.refetch,
  };
}

/** The hottest threads (pinned ones left out) for a cohort plus forum-wide ones; year null: every cohort. */
export function useHotThreads({
  n = 5,
  year = null,
  enabled = true,
}: { n?: number; year?: CohortYear | null; enabled?: boolean } = {}) {
  const size = Math.max(1, Math.min(20, Math.round(n)));
  return useQuery({
    enabled,
    queryKey: forumKeys.hot(size, year ?? null),
    queryFn: ({ signal }) =>
      call(
        api.GET('/api/v1/forum/threads/hot', { params: { query: { limit: size, year: year ?? undefined } }, signal }),
      ),
  });
}

/** Home's "Help the year below": up to `n` unanswered questions from the cohorts in `years`, newest first. */
export function useHelpBelow({
  years,
  n = 3,
  enabled = true,
}: {
  years: readonly CohortYear[];
  n?: number;
  enabled?: boolean;
}) {
  return useQuery({
    enabled: enabled && years.length > 0,
    queryKey: forumKeys.below(years, n),
    queryFn: async ({ signal }) => {
      const pages = await Promise.all(
        years.map((year) =>
          call(
            api.GET('/api/v1/forum/threads', {
              params: { query: { year, unanswered: true, sort: 'new', limit: 10 } },
              signal,
            }),
          ),
        ),
      );
      return pickBelow(
        pages.flatMap((p) => p.items),
        years,
        n,
      );
    },
    staleTime: 60_000,
  });
}

/**
 * Threads like a title being typed (the composer's "Similar threads"): any of its words, then ranked here by how much
 * of the title they share (lib/search.ts rankSimilar).
 */
export function useSimilarThreads(title: string) {
  const q = similarQuery(title);
  return useQuery({
    queryKey: forumKeys.similar(q),
    queryFn: async ({ signal }) =>
      (await call(api.GET('/api/v1/forum/threads', { params: { query: { q, limit: 30, sort: 'top' } }, signal })))
        .items,
    enabled: q.length >= 3,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** One thread with its replies. Re-read every 30 s while the page is visible, so new replies show up. */
/** The senior a thread is asked of (?senior=<id> from Career Navigator), while they are listed and seniors are on. */
export function useAskedSenior(userId: string | null): Senior | null {
  const on = useAuth().featureOn('career.seniors') && !!userId;
  const seniors = useQuery({
    queryKey: ['career', 'seniors'],
    queryFn: () => call(api.GET('/api/v1/career/seniors')),
    enabled: on,
    staleTime: 5 * 60_000,
  });
  return (on && seniors.data?.find((s) => s.user.id === userId)) || null;
}

export function useThread(slug: string) {
  return useQuery({
    queryKey: forumKeys.thread(slug),
    queryFn: ({ signal }) => call(api.GET('/api/v1/forum/threads/{slug}', { params: { path: { slug } }, signal })),
    enabled: !!slug,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useRelatedThreads(threadId: string | null | undefined, n = 4) {
  return useQuery({
    queryKey: forumKeys.related(threadId ?? '', n),
    queryFn: ({ signal }) =>
      call(
        api.GET('/api/v1/forum/threads/{thread_id}/related', {
          params: { path: { thread_id: threadId ?? '' }, query: { limit: n } },
          signal,
        }),
      ),
    enabled: !!threadId,
    staleTime: 5 * 60_000,
  });
}

/** The signed-in person opened a thread they have unread notifications about: those are read now. The thread stops
 *  being `unread` in every cached list at once, and the bell reads its count again. */
export function useThreadSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) =>
      call(api.POST('/api/v1/forum/threads/{thread_id}/seen', { params: { path: { thread_id: threadId } } })),
    onMutate: (threadId) => patchThread(qc, threadId, (t) => ({ ...t, unread: false })),
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

// ── Votes (optimistic) ──────────────────────────────────────────────────────────────────────────

export function useThreadVote() {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ threadId, up }: { threadId: string; up: boolean }) => {
      const opts = { params: { path: { thread_id: threadId } } };
      return call(
        up
          ? api.PUT('/api/v1/forum/threads/{thread_id}/vote', opts)
          : api.DELETE('/api/v1/forum/threads/{thread_id}/vote', opts),
      );
    },
    onMutate: ({ threadId, up }) => {
      const seq = nextVote(`t:${threadId}`);
      patchThread(qc, threadId, (t) => withVote(t, up));
      return { seq };
    },
    onError: (err, { threadId, up }) => {
      patchThread(qc, threadId, (t) => (t.voted === up ? withVote(t, !up) : t));
      push({ title: 'Your vote wasn’t saved', body: errorMessage(err), tone: 'alert' });
    },
    onSuccess: (res, { threadId }, ctx) => {
      if (ctx && isLatestVote(`t:${threadId}`, ctx.seq))
        patchThread(qc, threadId, (t) => ({ ...t, voted: res.voted, voteCount: res.voteCount }));
      if (res.voted) refreshFollow(qc, threadId);
    },
  });
}

export function useReplyVote() {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ replyId, up }: { replyId: string; up: boolean }) => {
      const opts = { params: { path: { reply_id: replyId } } };
      return call(
        up
          ? api.PUT('/api/v1/forum/replies/{reply_id}/vote', opts)
          : api.DELETE('/api/v1/forum/replies/{reply_id}/vote', opts),
      );
    },
    onMutate: ({ replyId, up }) => {
      const seq = nextVote(`r:${replyId}`);
      patchReply(qc, replyId, (r) => withVote(r, up));
      return { seq };
    },
    onError: (err, { replyId, up }) => {
      patchReply(qc, replyId, (r) => (r.voted === up ? withVote(r, !up) : r));
      push({ title: 'Your vote wasn’t saved', body: errorMessage(err), tone: 'alert' });
    },
    onSuccess: (res, { replyId }, ctx) => {
      if (ctx && isLatestVote(`r:${replyId}`, ctx.seq))
        patchReply(qc, replyId, (r) => ({ ...r, voted: res.voted, voteCount: res.voteCount }));
    },
  });
}

// ── Threads ─────────────────────────────────────────────────────────────────────────────────────

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ThreadCreate) => call(api.POST('/api/v1/forum/threads', { body })),
    onSuccess: (thread) => {
      qc.setQueryData(forumKeys.thread(thread.slug), thread);
      void invalidateLists(qc);
    },
  });
}

export function useUpdateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, patch }: { threadId: string; patch: ThreadUpdate }) =>
      call(api.PATCH('/api/v1/forum/threads/{thread_id}', { params: { path: { thread_id: threadId } }, body: patch })),
    onSuccess: (thread) => {
      storeThread(qc, thread);
      void invalidateLists(qc);
    },
  });
}

/** Delete a thread. `stay`: the page stays on it (a rep deleting a hidden thread's text), so it is read again;
 *  otherwise the page leaves for the list and the thread is only marked stale (no 404 flashes up first). */
export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId }: { threadId: string; slug: string; stay?: boolean }) =>
      call(api.DELETE('/api/v1/forum/threads/{thread_id}', { params: { path: { thread_id: threadId } } })),
    onSuccess: (_data, { slug, stay = false }) => {
      void qc.invalidateQueries({ queryKey: forumKeys.thread(slug), refetchType: stay ? 'active' : 'none' });
      void invalidateLists(qc);
      invalidateModeration(qc);
    },
  });
}

/** Follow a thread: 'answers', 'replies' or 'off' (forum.follow). */
export function useFollowThread() {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ threadId, level }: { threadId: string; level: FollowRequest['level'] }) =>
      call(
        api.PUT('/api/v1/forum/threads/{thread_id}/follow', {
          params: { path: { thread_id: threadId } },
          body: { level },
        }),
      ),
    onSuccess: ({ following }, { threadId }) => {
      qc.setQueriesData<ThreadDetail>({ queryKey: forumKeys.threads }, (data) =>
        data && data.id === threadId ? { ...data, following } : data,
      );
    },
    onError: (err) => push({ title: 'That wasn’t saved', body: errorMessage(err), tone: 'alert' }),
  });
}

/** Mark a reply as the answer (replyId null takes it away). */
export function useAcceptAnswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, replyId }: { threadId: string; replyId: string | null }) =>
      call(
        api.POST('/api/v1/forum/threads/{thread_id}/accept', {
          params: { path: { thread_id: threadId } },
          body: { replyId },
        }),
      ),
    onSuccess: (thread) => {
      storeThread(qc, thread);
      void invalidateLists(qc);
    },
  });
}

/** Moderators: pin, lock or hide a thread (and undo it). Hiding can carry a reason, sent to the author. */
export function useModerateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, change }: { threadId: string; change: ThreadModeration }) =>
      call(
        api.POST('/api/v1/forum/threads/{thread_id}/moderate', {
          params: { path: { thread_id: threadId } },
          body: change,
        }),
      ),
    onSuccess: (thread, { change }) => {
      storeThread(qc, thread);
      void invalidateLists(qc);
      if (change.status) invalidateModeration(qc);
    },
  });
}

// ── Replies ─────────────────────────────────────────────────────────────────────────────────────

export function useCreateReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, body, parentId }: { threadId: string; body: string; parentId: string | null }) =>
      call(
        api.POST('/api/v1/forum/threads/{thread_id}/replies', {
          params: { path: { thread_id: threadId } },
          body: { body, parentId },
        }),
      ),
    onSuccess: (reply) => {
      qc.setQueriesData<ThreadDetail>({ queryKey: forumKeys.threads }, (data) =>
        data && data.id === reply.threadId && !data.replies.some((r) => r.id === reply.id)
          ? {
              ...data,
              replies: [...data.replies, reply],
              replyCount: data.replyCount + (reply.status === 'visible' ? 1 : 0),
              lastActivityAt: reply.createdAt,
            }
          : data,
      );
      refreshFollow(qc, reply.threadId);
      void invalidateLists(qc);
    },
    onError: (e) => {
      // Locked, hidden or deleted since the page loaded (a 404 for someone who may no longer see it, or for a reply
      // that went): show the thread as it is now.
      if (e instanceof ApiError && (e.code === 'thread_locked' || e.code === 'post_unavailable' || e.status === 404)) {
        void qc.invalidateQueries({ queryKey: forumKeys.threads });
      }
    },
  });
}

export function useUpdateReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId, body }: { replyId: string; body: string }) =>
      call(api.PATCH('/api/v1/forum/replies/{reply_id}', { params: { path: { reply_id: replyId } }, body: { body } })),
    onSuccess: (reply) => patchReply(qc, reply.id, () => reply),
  });
}

export function useDeleteReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId }: { replyId: string }) =>
      call(api.DELETE('/api/v1/forum/replies/{reply_id}', { params: { path: { reply_id: replyId } } })),
    onSuccess: (_data, { replyId }) => {
      qc.setQueriesData<ThreadDetail>({ queryKey: forumKeys.threads }, (data) => {
        const target = data?.replies.find((r) => r.id === replyId);
        if (!data || !target) return data;
        // A hidden reply stays hidden, without its text (SEC-15); a visible one becomes a deleted one.
        const status = target.status === 'hidden' ? 'hidden' : 'deleted';
        return {
          ...data,
          replies: data.replies.map((r) => (r.id === replyId ? { ...r, status, body: '', canEdit: false } : r)),
          replyCount: Math.max(0, data.replyCount - (target.status === 'visible' ? 1 : 0)),
        };
      });
      void qc.invalidateQueries({ queryKey: forumKeys.threads });
      void invalidateLists(qc);
      invalidateModeration(qc);
    },
  });
}

/** Moderators: hide a reply (with a reason for its author, if they give one), or show it again. */
export function useModerateReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId, change }: { replyId: string; change: ReplyModeration }) =>
      call(
        api.POST('/api/v1/forum/replies/{reply_id}/moderate', {
          params: { path: { reply_id: replyId } },
          body: change,
        }),
      ),
    onSuccess: (reply) => {
      patchReply(qc, reply.id, () => reply);
      void qc.invalidateQueries({ queryKey: forumKeys.threads });
      void invalidateLists(qc);
      invalidateModeration(qc);
    },
  });
}

// ── Reports ─────────────────────────────────────────────────────────────────────────────────────

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReportCreate) => call(api.POST('/api/v1/reports', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reportKeys.all });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}

/** Moderators: reports with a status, newest first, page by page. */
export function useReports(
  status: ReportStatus,
  { pageSize = 20, enabled = true }: { pageSize?: number; enabled?: boolean } = {},
) {
  return useInfiniteQuery({
    queryKey: [...reportKeys.list(status), pageSize] as const,
    queryFn: ({ pageParam, signal }) =>
      call(
        api.GET('/api/v1/admin/reports', { params: { query: { status, limit: pageSize, offset: pageParam } }, signal }),
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled,
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reportId,
      status,
      note,
    }: {
      reportId: string;
      status: 'resolved' | 'dismissed';
      note: string | null;
    }) =>
      call(
        api.POST('/api/v1/admin/reports/{report_id}/resolve', {
          params: { path: { report_id: reportId } },
          body: { status, note },
        }),
      ),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: reportKeys.all });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}
