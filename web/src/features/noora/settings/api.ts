// Manage → Mini Noora (admins): her prompt and script (GET and PUT /mini-noora/settings), and the prompt her AI
// would read with a draft (POST /mini-noora/settings/preview). A save refreshes her script for everyone.
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../../api/client';
import type { NooraEditable, NooraPrompt, NooraSave } from '../../../api/types';
import { SCRIPT_KEY } from '../script';

export const EDIT_NOORA_KEY = ['mini-noora', 'settings'] as const;

const editNooraQuery = queryOptions({
  queryKey: EDIT_NOORA_KEY,
  queryFn: ({ signal }) => call(api.GET('/api/v1/mini-noora/settings', { signal })),
  // The editor keeps its own copy: a refetch in the background must not look like someone else's save.
  staleTime: Infinity,
  refetchOnWindowFocus: false,
});

export function useNooraSettings() {
  return useQuery(editNooraQuery);
}

export function useSaveNooraSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NooraSave) => call(api.PUT('/api/v1/mini-noora/settings', { body })),
    onSuccess: (saved: NooraEditable) => {
      qc.setQueryData(EDIT_NOORA_KEY, saved);
      qc.setQueryData(SCRIPT_KEY, saved.data.script);
    },
  });
}

/** Loads the settings again, as someone else saved them: the editor starts over from the copy it returns. */
export function useReloadNooraSettings() {
  const qc = useQueryClient();
  return () => qc.fetchQuery({ ...editNooraQuery, staleTime: 0 });
}

/** The prompt her AI would read with a draft of her instructions and facts (a POST that saves nothing), for the
 *  preview while it's open. */
export function usePromptPreview(prompt: NooraPrompt) {
  return useQuery({
    queryKey: ['mini-noora', 'preview', prompt] as const,
    queryFn: ({ signal }) => call(api.POST('/api/v1/mini-noora/settings/preview', { body: { prompt }, signal })),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}
