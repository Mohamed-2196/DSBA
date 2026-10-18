// Manage → Daily puzzles' data (holders of content.edit): the overview (themes, weeks, sizes), each game's items, the
// guess list, Nearest neighbour's vocabulary and the preview of a day, with the writes. Theme and week writes answer
// with the whole overview; item writes refresh the lists and the counts.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../../api/client';
import { nextOffset } from '../../../api/paging';
import type {
  BundleIn,
  DailyContentOverview,
  GuessAdd,
  ImportIn,
  ItemCreate,
  ItemSave,
  ThemeCreate,
  ThemeOrder,
  ThemeSave,
  VocabularyIn,
  VocabularySave,
  WeekSave,
} from '../../../api/types';
import { DAILY_KEY } from '../api';
import type { ContentGame, ItemStatus } from './lib/items';

export const DAILY_CONTENT_KEY = ['daily-content'] as const;
export const dailyContentKeys = {
  overview: () => [...DAILY_CONTENT_KEY, 'overview'] as const,
  items: (game: ContentGame, theme: string, status: ItemStatus, q: string) => [...DAILY_CONTENT_KEY, 'items', game, theme, status, q] as const,
  guesses: (q: string) => [...DAILY_CONTENT_KEY, 'guesses', q] as const,
  vocabulary: (q: string) => [...DAILY_CONTENT_KEY, 'vocabulary', q] as const,
  preview: (day: string) => [...DAILY_CONTENT_KEY, 'preview', day] as const,
};
const PAGE = 50;

/** The editor's lists and the hub's own queries (a theme's title shows there). */
function changed(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: DAILY_CONTENT_KEY });
  void qc.invalidateQueries({ queryKey: DAILY_KEY });
}

export function useDailyContent() {
  return useQuery({
    queryKey: dailyContentKeys.overview(),
    queryFn: ({ signal }) => call(api.GET('/api/v1/content/daily', { signal })),
  });
}

/** A game's items, filtered, a page at a time. */
export function useDailyItems(game: ContentGame, theme: string, status: ItemStatus, q: string) {
  return useInfiniteQuery({
    queryKey: dailyContentKeys.items(game, theme, status, q),
    queryFn: ({ pageParam, signal }) =>
      call(api.GET('/api/v1/content/daily/items', { params: { query: { game, theme: theme || undefined, status, q, limit: PAGE, offset: pageParam } }, signal })),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    placeholderData: keepPreviousData,
  });
}

function useOverviewWrite<T>(write: (body: T) => Promise<DailyContentOverview>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (overview) => {
      qc.setQueryData(dailyContentKeys.overview(), overview);
      changed(qc);
    },
  });
}

export function useCreateTheme() {
  return useOverviewWrite((body: ThemeCreate) => call(api.POST('/api/v1/content/daily/themes', { body })));
}

export function useSaveTheme() {
  return useOverviewWrite(({ id, ...body }: ThemeSave & { id: string }) =>
    call(api.PUT('/api/v1/content/daily/themes/{theme_id}', { params: { path: { theme_id: id } }, body })),
  );
}

export function useOrderThemes() {
  return useOverviewWrite((body: ThemeOrder) => call(api.POST('/api/v1/content/daily/themes/order', { body })));
}

export function useDeleteTheme() {
  return useOverviewWrite(({ id, version }: { id: string; version: number }) =>
    call(api.DELETE('/api/v1/content/daily/themes/{theme_id}', { params: { path: { theme_id: id }, query: { version } } })),
  );
}

export function useSetWeek() {
  return useOverviewWrite(({ weekStart, ...body }: WeekSave & { weekStart: string }) =>
    call(api.PUT('/api/v1/content/daily/weeks/{week_start}', { params: { path: { week_start: weekStart } }, body })),
  );
}

function useItemWrite<T, R>(write: (body: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: write, onSuccess: () => changed(qc) });
}

export function useCreateItem() {
  return useItemWrite((body: ItemCreate) => call(api.POST('/api/v1/content/daily/items', { body })));
}

export function useSaveItem() {
  return useItemWrite(({ id, ...body }: ItemSave & { id: string }) => call(api.PUT('/api/v1/content/daily/items/{item_id}', { params: { path: { item_id: id } }, body })));
}

export function useRetireItem() {
  return useItemWrite(({ id, version, retired }: { id: string; version: number; retired: boolean }) =>
    retired
      ? call(api.POST('/api/v1/content/daily/items/{item_id}/retire', { params: { path: { item_id: id } }, body: { version } }))
      : call(api.POST('/api/v1/content/daily/items/{item_id}/restore', { params: { path: { item_id: id } }, body: { version } })),
  );
}

export function useDeleteItem() {
  return useItemWrite(({ id, version }: { id: string; version: number }) =>
    call(api.DELETE('/api/v1/content/daily/items/{item_id}', { params: { path: { item_id: id }, query: { version } } })),
  );
}

/** A dry run changes nothing, so it refreshes nothing. */
export function useImportItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportIn) => call(api.POST('/api/v1/content/daily/import', { body })),
    onSuccess: (_, body) => {
      if (!body.dryRun) changed(qc);
    },
  });
}

export function useGuessList(q: string, enabled = true) {
  return useQuery({
    queryKey: dailyContentKeys.guesses(q),
    queryFn: ({ signal }) => call(api.GET('/api/v1/content/daily/guesses', { params: { query: { q } }, signal })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAddGuesses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GuessAdd) => call(api.POST('/api/v1/content/daily/guesses', { body })),
    onSuccess: (_, body) => {
      if (!body.dryRun) changed(qc);
    },
  });
}

export function useRemoveGuess() {
  return useItemWrite((word: string) => call(api.DELETE('/api/v1/content/daily/guesses/{word}', { params: { path: { word } } })));
}

export function useVocabulary(q: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: dailyContentKeys.vocabulary(q),
    queryFn: ({ pageParam, signal }) => call(api.GET('/api/v1/content/daily/vocabulary', { params: { query: { q, limit: PAGE, offset: pageParam } }, signal })),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAddVocabulary() {
  return useItemWrite((body: VocabularyIn) => call(api.POST('/api/v1/content/daily/vocabulary', { body })));
}

export function useSaveVocabulary() {
  return useItemWrite(({ word, ...body }: VocabularySave & { word: string }) =>
    call(api.PUT('/api/v1/content/daily/vocabulary/{word}', { params: { path: { word } }, body })),
  );
}

export function useDeleteVocabulary() {
  return useItemWrite(({ word, version }: { word: string; version: number }) =>
    call(api.DELETE('/api/v1/content/daily/vocabulary/{word}', { params: { path: { word }, query: { version } } })),
  );
}

/** An admin's content file: a dry run changes nothing, so it refreshes nothing. */
export function useImportBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BundleIn) => call(api.POST('/api/v1/content/daily/bundle', { body })),
    onSuccess: (report) => {
      if (report.applied) changed(qc);
    },
  });
}

export function useDailyPreview(day: string) {
  return useQuery({
    queryKey: dailyContentKeys.preview(day),
    queryFn: ({ signal }) => call(api.GET('/api/v1/content/daily/preview', { params: { query: { day } }, signal })),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(day),
  });
}
