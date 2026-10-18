// Bug reports: anyone sends one; admins read them in Manage and mark them fixed or won't fix.
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ADMIN_STATS_KEY } from '../../api/keys';
import { nextOffset } from '../../api/paging';
import type { BugReportCreate, BugReportOut } from '../../api/types';

export type BugStatus = BugReportOut['status'];
const PAGE = 20;

export const bugKeys = {
  all: ['admin', 'bug-reports'] as const,
  list: (status: BugStatus) => ['admin', 'bug-reports', status] as const,
};

export function useReportBug() {
  return useMutation({
    mutationFn: (body: BugReportCreate) => call(api.POST('/api/v1/bug-reports', { body })),
  });
}

export function useBugReports(status: BugStatus) {
  return useInfiniteQuery({
    queryKey: bugKeys.list(status),
    queryFn: ({ pageParam, signal }) =>
      call(
        api.GET('/api/v1/admin/bug-reports', { params: { query: { status, limit: PAGE, offset: pageParam } }, signal }),
      ),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

export function useSetBugStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BugStatus }): Promise<BugReportOut> =>
      call(
        api.PATCH('/api/v1/admin/bug-reports/{report_id}', { params: { path: { report_id: id } }, body: { status } }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: bugKeys.all });
      void qc.invalidateQueries({ queryKey: ADMIN_STATS_KEY });
    },
  });
}
