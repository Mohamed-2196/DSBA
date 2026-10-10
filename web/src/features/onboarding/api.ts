// Onboarding saves the cohort a signed-in student picks on their account: PATCH /api/v1/me { year }.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ME_KEY } from '../../auth';
import type { CohortYear } from '../../lib/modules';

export function useSaveCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: CohortYear) => call(api.PATCH('/api/v1/me', { body: { year } })),
    onSuccess: (me) => qc.setQueryData(ME_KEY, me),
  });
}
