// The guides (GET /guides, for everyone): Start here, Results day and Choosing your Year 3 electives, and their editor
// (holders of guides.edit). A save refreshes what everyone sees.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { GuidesEditable, GuidesSave } from '../../api/types';

export const GUIDES_KEY = ['guides'] as const;
export const EDIT_GUIDES_KEY = ['guides', 'edit'] as const;

/** Every guide. They change a few times a year: one load per visit is plenty. */
export function useGuides() {
  return useQuery({
    queryKey: GUIDES_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/guides', { signal })),
    staleTime: 10 * 60_000,
  });
}

export function useGuidesForEditing() {
  return useQuery({
    queryKey: EDIT_GUIDES_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/guides/edit', { signal })),
    // The editor keeps its own copy: a refetch in the background must not look like someone else's save.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSaveGuides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GuidesSave) => call(api.PUT('/api/v1/guides', { body })),
    onSuccess: (saved: GuidesEditable) => {
      qc.setQueryData(EDIT_GUIDES_KEY, saved);
      qc.setQueryData(GUIDES_KEY, saved.data);
    },
  });
}

/** Loads the guides again, as someone else saved them: the editor starts over from there. */
export function useReloadGuides() {
  const qc = useQueryClient();
  return () => qc.refetchQueries({ queryKey: EDIT_GUIDES_KEY, exact: true });
}
