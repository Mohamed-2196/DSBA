// The Career Navigator editor's data (holders of career.edit): the whole document with its version, and the save.
// A save also refreshes what students see.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../../api/client';
import type { CareerEditable, CareerSave } from '../../../api/types';
import { CAREER_KEY } from '../api';

export const EDIT_CAREER_KEY = [...CAREER_KEY, 'edit'] as const;

export function useCareerForEditing() {
  return useQuery({
    queryKey: EDIT_CAREER_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/career/edit', { signal })),
    // The editor keeps its own copy: a refetch in the background must not look like someone else's save.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSaveCareer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CareerSave) => call(api.PUT('/api/v1/career', { body })),
    onSuccess: (saved: CareerEditable) => {
      qc.setQueryData(EDIT_CAREER_KEY, saved);
      void qc.invalidateQueries({ queryKey: CAREER_KEY, exact: true });
    },
  });
}

/** Loads the document again, as someone else saved it: the editor starts over from there. */
export function useReloadCareer() {
  const qc = useQueryClient();
  return () => qc.refetchQueries({ queryKey: EDIT_CAREER_KEY, exact: true });
}
