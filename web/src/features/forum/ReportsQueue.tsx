// The moderators' queue of reports (GET /admin/reports), rendered in the Reports section of
// features/manage/ManagePage.
// A report points at a thread, a reply or a library file. The way through: open the post, deal with it there (hide
// it from its menu, for example), then resolve the report here with a short note; or dismiss it when the post is fine.
import { useMemo, useState } from 'react';
import { ApiError } from '../../api/errors';
import { remainingCount } from '../../api/paging';
import { useAuth } from '../../auth';
import { EmptyState, glyph, Icon, Panel, QueryError, Skeleton, TabPanel, Tabs } from '../../ui';
import { useReports } from './api';
import type { ReportOut } from '../../api/types';
import type { ReportStatus } from './types';
import { DecideDialog } from './components/DecideDialog';
import { LoadMore } from './components/LoadMore';
import { ReportCard, type Decision } from './components/ReportCard';
import './components/dialogs.css';
import './ReportsQueue.css';

const STATUSES: { id: ReportStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
];

const EMPTY: Record<ReportStatus, { title: string; body: string }> = {
  open: { title: 'No open reports', body: 'When someone reports a post or a file, it shows up here.' },
  resolved: { title: 'No resolved reports yet', body: 'Reports you act on move here, with your note.' },
  dismissed: { title: 'No dismissed reports', body: 'Reports that needed no action move here.' },
};

function flatten(pages: { items: ReportOut[] }[] | undefined): ReportOut[] {
  const seen = new Set<string>();
  const out: ReportOut[] = [];
  for (const p of pages ?? []) {
    for (const r of p.items) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

function NotForYou() {
  return (
    <Panel padding="none">
      <EmptyState
        icon={<Icon glyph={glyph.flag} />}
        title="Reports aren’t on your account"
        body="Ask an admin if you should have access."
      />
    </Panel>
  );
}

function ReportsSkeleton() {
  return (
    <Panel as="div" padding="none" aria-busy="true">
      <ul role="list" className="forum-reports__list" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="forum-reports__item">
            <Skeleton width={36} height={36} radius="10px" />
            <div className="forum-reports__main">
              <Skeleton width="30%" height="0.8em" />
              <Skeleton width="70%" height="1.1em" style={{ marginTop: 8 }} />
              <Skeleton width="45%" height="0.8em" style={{ marginTop: 10 }} />
            </div>
          </li>
        ))}
      </ul>
      <span className="visually-hidden" role="status">
        Loading reports
      </span>
    </Panel>
  );
}

function ReportList({ status }: { status: ReportStatus }) {
  const reports = useReports(status);
  const [decision, setDecision] = useState<{ report: ReportOut; status: Decision } | null>(null);
  const items = useMemo(() => flatten(reports.data?.pages), [reports.data]);

  if (reports.isPending) return <ReportsSkeleton />;
  if (reports.isError && !reports.data) {
    const forbidden =
      reports.error instanceof ApiError && (reports.error.status === 403 || reports.error.status === 401);
    return forbidden ? (
      <NotForYou />
    ) : (
      <QueryError
        error={reports.error}
        title="The reports didn’t load"
        onRetry={() => void reports.refetch()}
        retrying={reports.isFetching}
      />
    );
  }
  if (!items.length) {
    return (
      <Panel padding="none">
        <EmptyState
          icon={status === 'open' ? <Icon glyph={glyph.success} /> : <Icon glyph={glyph.flag} />}
          title={EMPTY[status].title}
          body={EMPTY[status].body}
        />
      </Panel>
    );
  }
  return (
    <>
      <Panel as="div" padding="none">
        <ul role="list" className="forum-reports__list">
          {items.map((r) => (
            <ReportCard key={r.id} report={r} onDecide={(report, s) => setDecision({ report, status: s })} />
          ))}
        </ul>
      </Panel>
      {reports.hasNextPage ? (
        <LoadMore
          noun="reports"
          remaining={remainingCount(reports.data?.pages)}
          loading={reports.isFetchingNextPage}
          onClick={() => void reports.fetchNextPage()}
        />
      ) : null}
      {reports.isFetchNextPageError ? (
        <QueryError
          error={reports.error}
          title="More reports didn’t load"
          onRetry={() => void reports.fetchNextPage()}
          retrying={reports.isFetchingNextPage}
          size="sm"
          panel={false}
        />
      ) : null}
      <DecideDialog decision={decision} onClose={() => setDecision(null)} />
    </>
  );
}

/** The moderators' list of reports: open, resolved and dismissed. */
export function ReportsQueue() {
  const { can, status: authStatus } = useAuth();
  const handles = can('forum.moderate') || can('library.manage') || can('requests.manage');
  const [status, setStatus] = useState<ReportStatus>('open');
  const open = useReports('open', { enabled: handles });
  const openCount = open.data?.pages[0]?.total;

  if (authStatus !== 'loading' && !handles) return <NotForYou />;

  return (
    <section className="forum-reports" aria-label="Reports" data-hub="reports-queue">
      <Tabs
        idBase="reports"
        label="Reports by status"
        className="forum-reports__tabs"
        tabs={STATUSES.map((s) => ({
          id: s.id,
          label: s.label,
          count: s.id === 'open' && openCount ? openCount : undefined,
        }))}
        value={status}
        onChange={(id: string) => setStatus(STATUSES.find((s) => s.id === id)?.id ?? 'open')}
      />
      <TabPanel idBase="reports" id={status} value={status} className="forum-reports__panel">
        {handles ? <ReportList key={status} status={status} /> : null}
      </TabPanel>
    </section>
  );
}
