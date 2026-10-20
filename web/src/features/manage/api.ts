// The hub's numbers for Manage. The queues (forum reports, library uploads) invalidate ADMIN_STATS_KEY after a
// decision, so they follow. A count is null while its feature is switched off. Mini Noora's AI usage and limits
// have their own query.
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ADMIN_STATS_KEY } from '../../api/keys';
import type {
  NooraLimitsIn,
  NotebookLimitsIn,
  SummaryEditable,
  SummarySave,
  SummaryWords,
  UploadLimitsIn,
} from '../../api/types';
import type { CohortYear } from '../../state';

const NOORA_USAGE_KEY = ['admin', 'noora'] as const;
const NOTEBOOK_UPLOADS_KEY = ['admin', 'notebook'] as const;
const UPLOAD_LIMITS_KEY = ['admin', 'uploads'] as const;

export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_STATS_KEY,
    queryFn: () => call(api.GET('/api/v1/admin/stats')),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Mini Noora's AI: the limits, and the questions and estimated cost today and this month. */
export function useNooraUsage(enabled: boolean) {
  return useQuery({
    queryKey: NOORA_USAGE_KEY,
    queryFn: () => call(api.GET('/api/v1/admin/noora')),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Admins set the questions per student per day and the monthly budget. */
export function useSetNooraLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NooraLimitsIn) => call(api.PUT('/api/v1/admin/noora', { body })),
    onSuccess: (out) => qc.setQueryData(NOORA_USAGE_KEY, out),
  });
}

/** The notebook's uploads (admins): the hourly limit, the counts, the top uploaders and the storage used. */
export function useNotebookUploads(enabled: boolean) {
  return useQuery({
    queryKey: NOTEBOOK_UPLOADS_KEY,
    queryFn: () => call(api.GET('/api/v1/admin/notebook')),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Admins set the pictures, files and PDFs a student may upload to their notes in an hour. */
export function useSetNotebookLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotebookLimitsIn) => call(api.PUT('/api/v1/admin/notebook', { body })),
    onSuccess: (out) => qc.setQueryData(NOTEBOOK_UPLOADS_KEY, out),
  });
}

/** The hub's and each account's upload budgets per 24 hours (admins), and the bytes uploaded in the last 24 hours. */
export function useUploadLimits(enabled: boolean) {
  return useQuery({
    queryKey: UPLOAD_LIMITS_KEY,
    queryFn: () => call(api.GET('/api/v1/admin/uploads')),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Admins set the megabytes the whole hub, and each account, may upload in 24 hours. */
export function useSetUploadLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UploadLimitsIn) => call(api.PUT('/api/v1/admin/uploads', { body })),
    onSuccess: (out) => qc.setQueryData(UPLOAD_LIMITS_KEY, out),
  });
}

/** What's missing, by the boxes the person holds. */
export function useGaps() {
  return useQuery({ queryKey: ['admin', 'gaps'] as const, queryFn: () => call(api.GET('/api/v1/admin/gaps')) });
}

/** A year's Sunday summary for this week: the text reps paste into the group. */
export function useSummaryPreview(year: CohortYear) {
  return useQuery({
    queryKey: ['summary', 'preview', year] as const,
    queryFn: () => call(api.GET('/api/v1/summary/preview', { params: { query: { year } } })),
  });
}

const SUMMARY_WORDS_KEY = ['summary', 'words'] as const;

const summaryWordsQuery = queryOptions({
  queryKey: SUMMARY_WORDS_KEY,
  queryFn: ({ signal }) => call(api.GET('/api/v1/summary/settings', { signal })),
  // The editor keeps its own copy: a refetch in the background must not look like someone else's save.
  staleTime: Infinity,
  refetchOnWindowFocus: false,
});

/** The summary's words for their editor (summary.share). */
export function useSummaryWords() {
  return useQuery(summaryWordsQuery);
}

/** Saving the words: the week's text above shows them at once. */
export function useSaveSummaryWords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SummarySave) => call(api.PUT('/api/v1/summary/settings', { body })),
    onSuccess: (saved: SummaryEditable) => {
      qc.setQueryData(SUMMARY_WORDS_KEY, saved);
      void qc.invalidateQueries({ queryKey: ['summary', 'preview'] });
    },
  });
}

/** Loads the words again, as someone else saved them: the editor starts over from the copy it returns. */
export function useReloadSummaryWords() {
  const qc = useQueryClient();
  return () => qc.fetchQuery({ ...summaryWordsQuery, staleTime: 0 });
}

/** This week's summary for a year in a draft of the words (a POST that saves nothing), while the preview is open. */
export function useSummaryDraft(year: CohortYear, words: SummaryWords, enabled: boolean) {
  return useQuery({
    queryKey: ['summary', 'draft', year, words] as const,
    queryFn: ({ signal }) => call(api.POST('/api/v1/summary/settings/preview', { body: { year, words }, signal })),
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}
