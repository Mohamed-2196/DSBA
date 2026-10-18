// The grades calculator's rules (GET /grades/rules), which admins edit in Manage → Grades calculator. The calculator
// applies them in the browser: students' marks never reach the server.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import type { GradeRulesEditable, GradeRulesSave } from '../../api/types';
import { PAPER_CHOICES_KEY } from '../papers/public';

export const GRADE_RULES_KEY = ['grades', 'rules'] as const;

/** The rules change a few times a year at most: one load every ten minutes is plenty. */
export function useGradeRules() {
  return useQuery({
    queryKey: GRADE_RULES_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/grades/rules', { signal })),
    staleTime: 10 * 60_000,
  });
}

// Outside the rules' own key, so refreshing them never refetches the editor's copy.
const EDIT_RULES_KEY = ['grade-rules-edit'] as const;

export function useGradeRulesForEditing() {
  return useQuery({
    queryKey: EDIT_RULES_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/grades/rules/edit', { signal })),
    // The editor keeps its own copy: a refetch in the background must not look like someone else's save.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSaveGradeRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GradeRulesSave) => call(api.PUT('/api/v1/grades/rules', { body })),
    onSuccess: (saved: GradeRulesEditable) => {
      qc.setQueryData(EDIT_RULES_KEY, saved);
      qc.setQueryData(GRADE_RULES_KEY, saved.data);
      void qc.invalidateQueries({ queryKey: PAPER_CHOICES_KEY }); // the option and electives come from the rules
    },
  });
}

export function useReloadGradeRules() {
  const qc = useQueryClient();
  return () => qc.refetchQueries({ queryKey: EDIT_RULES_KEY, exact: true });
}
