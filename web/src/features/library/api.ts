// Library data: TanStack Query hooks over /api/v1/library/* (see api/app/routers/library.py for the rules).
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { api, apiUrl, call } from '../../api/client';
import type {
  FileLink,
  LibraryFacets,
  LibraryItem,
  LibraryItemCreate,
  LibraryItemUpdate,
  LibraryPage,
  ReviewDecision,
  StarResult,
} from '../../api/types';
import type { CohortYear, LibraryQuery } from './types';

// ── Keys ──────────────────────────────────────────────────────────────────────

export const LIBRARY_KEY = ['library'] as const;
const LISTS_KEY = ['library', 'list'] as const;
const ITEMS_KEY = ['library', 'item'] as const;

/** Drop empty filters so equal queries share one cache entry. */
function normalizeQuery(query: LibraryQuery): LibraryQuery {
  const out: LibraryQuery = {};
  if (query.q?.trim()) out.q = query.q.trim();
  if (query.moduleId) out.moduleId = query.moduleId;
  if (query.year) out.year = query.year;
  if (query.kind) out.kind = query.kind;
  if (query.source) out.source = query.source;
  if (query.sort && query.sort !== 'new') out.sort = query.sort;
  if (query.starred) out.starred = true;
  if (query.mine) out.mine = true;
  if (query.status) out.status = query.status;
  return out;
}

export const libraryKeys = {
  all: LIBRARY_KEY,
  lists: LISTS_KEY,
  list: (shape: 'page' | 'pages', query: LibraryQuery, limit: number) => [...LISTS_KEY, shape, normalizeQuery(query), limit] as const,
  facets: ['library', 'facets'] as const,
  items: ITEMS_KEY,
  item: (idOrSlug: string) => [...ITEMS_KEY, idOrSlug] as const,
  file: (id: string) => ['library', 'file', id] as const,
};

/** The filters part of a list key (for predicates). */
function listQueryOf(key: QueryKey): LibraryQuery | null {
  return key[0] === 'library' && key[1] === 'list' && typeof key[3] === 'object' && key[3] ? (key[3] as LibraryQuery) : null;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

function fetchPage(query: LibraryQuery, limit: number, offset: number, signal?: AbortSignal): Promise<LibraryPage> {
  const q = normalizeQuery(query);
  return call(
    api.GET('/api/v1/library/items', {
      params: {
        query: {
          q: q.q,
          module_id: q.moduleId ?? undefined,
          year: q.year ?? undefined,
          kind: q.kind ?? undefined,
          source: q.source ?? undefined,
          sort: q.sort,
          starred: q.starred,
          mine: q.mine,
          status: q.status ?? undefined,
          limit,
          offset,
        },
      },
      signal,
    }),
  );
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 24;

/** A filtered list, loaded a page at a time ("Show more"). Keeps the previous results while filters change. */
export function useLibraryPages(query: LibraryQuery, { pageSize = PAGE_SIZE, enabled = true }: { pageSize?: number; enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: libraryKeys.list('pages', query, pageSize),
    queryFn: ({ pageParam, signal }) => fetchPage(query, pageSize, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** One page of a list (small lists: a module's files, the review queue, your uploads). */
export function useLibraryList(query: LibraryQuery, { limit = PAGE_SIZE, enabled = true }: { limit?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: libraryKeys.list('page', query, limit),
    queryFn: ({ signal }) => fetchPage(query, limit, 0, signal),
    enabled,
  });
}

/** The newest published files, optionally for one cohort (Home's "New in the library"). */
export function useRecentFiles({ n = 6, year = null }: { n?: number; year?: CohortYear | null } = {}) {
  const query: LibraryQuery = { sort: 'new', year };
  return useQuery({
    queryKey: libraryKeys.list('page', query, n),
    queryFn: ({ signal }) => fetchPage(query, n, 0, signal),
    select: (page: LibraryPage) => page.items,
  });
}

/** Counts of published items by kind, module and year. */
export function useLibraryFacets() {
  return useQuery({
    queryKey: libraryKeys.facets,
    queryFn: ({ signal }): Promise<LibraryFacets> => call(api.GET('/api/v1/library/facets', { signal })),
    staleTime: 5 * 60_000,
  });
}

/** One item, by id or slug. */
export function useLibraryItem(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: libraryKeys.item(idOrSlug ?? ''),
    queryFn: ({ signal }) => call(api.GET('/api/v1/library/items/{item}', { params: { path: { item: idOrSlug ?? '' } }, signal })),
    enabled: !!idOrSlug,
  });
}

/**
 * A short-lived link that shows a PDF or an image in the browser. Refreshed shortly before it expires, so a
 * link taken from it (Open in a new tab) always works.
 */
export function useFileLink(id: string | null, { enabled = true }: { enabled?: boolean } = {}) {
  const fresh = (data: FileLink | undefined) => Math.max(15, (data?.expiresIn ?? 60) - 30) * 1000;
  return useQuery({
    queryKey: libraryKeys.file(id ?? ''),
    queryFn: ({ signal }) => call(api.GET('/api/v1/library/items/{item_id}/file', { params: { path: { item_id: id ?? '' } }, signal })),
    enabled: enabled && !!id,
    staleTime: (q) => fresh(q.state.data),
    refetchInterval: (q) => fresh(q.state.data),
    gcTime: 60_000,
  });
}

// ── Links the browser follows ─────────────────────────────────────────────────

/** Download (files) or open (links): the API counts it and redirects to the bucket or the link's address. */
export function downloadHref(item: Pick<LibraryItem, 'id'>): string {
  return apiUrl(`/api/v1/library/items/${encodeURIComponent(item.id)}/download`);
}

/** The same, as an absolute URL: links open it in a new tab (buttons treat absolute URLs as external). */
export function openLinkHref(item: Pick<LibraryItem, 'id'>): string {
  return new URL(downloadHref(item), window.location.href).href;
}

/** The item's page in the app. */
export function itemPath(item: Pick<LibraryItem, 'id' | 'slug'>): string {
  return `/library/${encodeURIComponent(item.slug || item.id)}`;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

type ListData = LibraryPage | InfiniteData<LibraryPage, number>;

function isInfinite(d: ListData): d is InfiniteData<LibraryPage, number> {
  return 'pages' in d;
}

/** Apply fn to every item of a cached list; fn returns null to drop the item. */
function mapList(data: ListData | undefined, fn: (item: LibraryItem) => LibraryItem | null): ListData | undefined {
  if (!data) return data;
  const mapPage = (page: LibraryPage): LibraryPage => {
    let removed = 0;
    const items: LibraryItem[] = [];
    for (const it of page.items) {
      const next = fn(it);
      if (next) items.push(next);
      else removed += 1;
    }
    return removed || items.some((it, i) => it !== page.items[i]) ? { ...page, items, total: Math.max(0, page.total - removed) } : page;
  };
  return isInfinite(data) ? { ...data, pages: data.pages.map(mapPage) } : mapPage(data);
}

type Snapshot = [QueryKey, unknown][];

function snapshotLibrary(qc: QueryClient): Snapshot {
  return [...qc.getQueriesData({ queryKey: LISTS_KEY }), ...qc.getQueriesData({ queryKey: ITEMS_KEY })];
}

function restoreSnapshot(qc: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}

/** Update one item wherever it is cached (lists and detail queries). */
export function patchCachedItem(qc: QueryClient, id: string, patch: Partial<LibraryItem> | ((item: LibraryItem) => LibraryItem)) {
  const apply = (it: LibraryItem) => (typeof patch === 'function' ? patch(it) : { ...it, ...patch });
  qc.setQueriesData<ListData>({ queryKey: LISTS_KEY }, (d) => mapList(d, (it) => (it.id === id ? apply(it) : it)));
  qc.setQueriesData<LibraryItem>({ queryKey: ITEMS_KEY }, (d) => (d && d.id === id ? apply(d) : d));
}

function removeCachedItem(qc: QueryClient, id: string) {
  qc.setQueriesData<ListData>({ queryKey: LISTS_KEY }, (d) => mapList(d, (it) => (it.id === id ? null : it)));
}

/** Cancel refetches that would overwrite an optimistic change (never a first load: that would leave it hanging). */
async function cancelLibraryRefetches(qc: QueryClient) {
  await qc.cancelQueries({ queryKey: LIBRARY_KEY, predicate: (q) => q.state.data !== undefined && q.queryKey[1] !== 'file' });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** The moderation page's counters (uploads to review, library files) follow every change. */
const ADMIN_STATS_KEY = ['admin', 'stats'] as const;

/** Star or unstar (optimistic). */
export function useStarItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }): Promise<StarResult> =>
      call(
        starred
          ? api.PUT('/api/v1/library/items/{item_id}/star', { params: { path: { item_id: id } } })
          : api.DELETE('/api/v1/library/items/{item_id}/star', { params: { path: { item_id: id } } }),
      ),
    onMutate: async ({ id, starred }) => {
      await cancelLibraryRefetches(qc);
      const snapshot = snapshotLibrary(qc);
      patchCachedItem(qc, id, { starred });
      return { snapshot };
    },
    onError: (_e, _v, ctx) => restoreSnapshot(qc, ctx?.snapshot),
    onSuccess: (res, { id }) => patchCachedItem(qc, id, { starred: res.starred }),
    onSettled: () => qc.invalidateQueries({ queryKey: LISTS_KEY, predicate: (q) => !!listQueryOf(q.queryKey)?.starred }),
  });
}

/** Turn a completed upload into a library item (pending for students, published for moderators). */
export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryItemCreate): Promise<LibraryItem> => call(api.POST('/api/v1/library/items', { body })),
    onSuccess: (item) => {
      qc.setQueryData(libraryKeys.item(item.id), item);
      void qc.invalidateQueries({ queryKey: LISTS_KEY });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
      if (item.status === 'published') void qc.invalidateQueries({ queryKey: libraryKeys.facets });
    },
  });
}

/** Edit an item: its uploader while it is pending, moderators always. */
export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LibraryItemUpdate }): Promise<LibraryItem> =>
      call(api.PATCH('/api/v1/library/items/{item_id}', { params: { path: { item_id: id } }, body })),
    onSuccess: (item) => {
      patchCachedItem(qc, item.id, () => item);
      void qc.invalidateQueries({ queryKey: LISTS_KEY });
    },
  });
}

/** Delete an item: its uploader or a moderator. */
export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => call(api.DELETE('/api/v1/library/items/{item_id}', { params: { path: { item_id: id } } })),
    onSuccess: (_d, { id }) => {
      removeCachedItem(qc, id);
      qc.removeQueries({ queryKey: ITEMS_KEY, predicate: (q) => (q.state.data as LibraryItem | undefined)?.id === id });
      void qc.invalidateQueries({ queryKey: LISTS_KEY });
      void qc.invalidateQueries({ queryKey: libraryKeys.facets });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}

/** Moderators: publish or reject a pending upload (the uploader is notified). */
export function useReviewItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReviewDecision }): Promise<LibraryItem> =>
      call(api.POST('/api/v1/library/items/{item_id}/review', { params: { path: { item_id: id } }, body })),
    onSuccess: (item) => {
      // Leave the review queue at once; everything else is re-read.
      qc.setQueriesData<ListData>({ queryKey: LISTS_KEY, predicate: (q) => listQueryOf(q.queryKey)?.status === 'pending' }, (d) =>
        mapList(d, (it) => (it.id === item.id ? null : it)),
      );
      patchCachedItem(qc, item.id, () => item);
      void qc.invalidateQueries({ queryKey: LISTS_KEY, predicate: (q) => listQueryOf(q.queryKey)?.status !== 'pending' });
      void qc.invalidateQueries({ queryKey: libraryKeys.facets });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}
