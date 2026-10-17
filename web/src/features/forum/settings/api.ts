// Manage → Forum (forum.moderate): the categories, tags, guidelines and tips (GET and PUT /forum/settings). A save
// refreshes what everyone sees: the forum's categories, the composer and the sidebar (GET /forum/meta).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../../api/client';
import type { ForumSettingsEditable, ForumSettingsSave } from '../../../api/types';
import { forumKeys } from '../api';

// Outside the forum's own keys (['forum', …]), so refreshing the forum never refetches the editor's copy.
export const EDIT_FORUM_KEY = ['forum-settings'] as const;

export function useForumSettings() {
  return useQuery({
    queryKey: EDIT_FORUM_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/forum/settings', { signal })),
    // The editor keeps its own copy: a refetch in the background must not look like someone else's save.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSaveForumSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ForumSettingsSave) => call(api.PUT('/api/v1/forum/settings', { body })),
    onSuccess: (saved: ForumSettingsEditable) => {
      qc.setQueryData(EDIT_FORUM_KEY, saved);
      void qc.invalidateQueries({ queryKey: forumKeys.meta });
      void qc.invalidateQueries({ queryKey: forumKeys.stats });
    },
  });
}

/** Loads the settings again, as someone else saved them: the editor starts over from there. */
export function useReloadForumSettings() {
  const qc = useQueryClient();
  return () => qc.refetchQueries({ queryKey: EDIT_FORUM_KEY, exact: true });
}
