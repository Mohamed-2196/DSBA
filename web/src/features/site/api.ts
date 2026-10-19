// Site settings: the hub's own words and links (GET /site, for everyone), and their editor (admins). A save refreshes
// what everyone sees: the footer, About, the sidebar's links, search and the grades calculator.
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { SiteEditable, SiteSave } from '../../api/types';

export const SITE_KEY = ['site'] as const;
export const EDIT_SITE_KEY = ['site', 'edit'] as const;

/** The hub's words and links. They change rarely: one load per visit is plenty. */
export function useSite() {
  return useQuery({
    queryKey: SITE_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/site', { signal })),
    staleTime: 10 * 60_000,
  });
}

const editSiteQuery = queryOptions({
  queryKey: EDIT_SITE_KEY,
  queryFn: ({ signal }) => call(api.GET('/api/v1/site/edit', { signal })),
  // The editor keeps its own copy: a refetch in the background must not look like someone else's save.
  staleTime: Infinity,
  refetchOnWindowFocus: false,
});

export function useSiteForEditing() {
  return useQuery(editSiteQuery);
}

export function useSaveSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SiteSave) => call(api.PUT('/api/v1/site', { body })),
    onSuccess: (saved: SiteEditable) => {
      qc.setQueryData(EDIT_SITE_KEY, saved);
      qc.setQueryData(SITE_KEY, saved.data);
    },
  });
}

/** Loads the settings again, as someone else saved them: the editor starts over from the copy it returns. */
export function useReloadSite() {
  const qc = useQueryClient();
  return () => qc.fetchQuery({ ...editSiteQuery, staleTime: 0 });
}
