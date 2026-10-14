// The signed-in person's preferences (PATCH /me { preferences }): email switches, lesson progress and Home's
// layout. A change shows at once and goes back if the server says no. Writes share one scope, so a quick run of
// changes (Home's blocks moved one step at a time) reaches the API in the order it was made.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../api/client';
import type { Me, PreferencesUpdate } from '../api/types';
import { ME_KEY } from './queries';

/** The preferences after `patch`: a switch sent as null stays as it is; `homeBlocks: null` is the default layout. */
export function applyPreferences(prefs: Me['preferences'], patch: PreferencesUpdate): Me['preferences'] {
  const next: Me['preferences'] = { ...prefs };
  for (const [key, value] of Object.entries(patch) as [keyof PreferencesUpdate, PreferencesUpdate[keyof PreferencesUpdate]][]) {
    if (key === 'homeBlocks') next.homeBlocks = patch.homeBlocks ?? null;
    else if (typeof value === 'boolean') next[key] = value;
  }
  return next;
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: 'preferences' },
    mutationFn: (preferences: PreferencesUpdate) => call(api.PATCH('/api/v1/me', { body: { preferences } })),
    onMutate: async (preferences) => {
      await qc.cancelQueries({ queryKey: ME_KEY });
      const before = qc.getQueryData<Me | null>(ME_KEY);
      if (before) qc.setQueryData<Me>(ME_KEY, { ...before, preferences: applyPreferences(before.preferences, preferences) });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(ME_KEY, ctx.before);
    },
    onSuccess: (me) => {
      // Only the last change in flight speaks for the server: an earlier answer is already out of date.
      if (qc.isMutating({ predicate: (m) => m.options.scope?.id === 'preferences' }) <= 1) qc.setQueryData(ME_KEY, me);
    },
  });
}
