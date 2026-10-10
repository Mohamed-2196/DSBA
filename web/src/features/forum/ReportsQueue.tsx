// The moderators' queue of reports (GET /admin/reports), rendered by features/moderation/ModerationPage.
// A report points at a thread, a reply or a library file. The way through: open the post, deal with it there (hide
// it from its menu, for example), then resolve the report here with a short note; or dismiss it when the post is fine.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowBendUpLeft, ArrowSquareOut, ChatCircleText, CheckCircle, FileText, Flag, XCircle } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { Badge, Button, EmptyState, Modal, Panel, Skeleton, TabPanel, Tabs, TextArea, timeAgo } from '../../ui';
import { useToast } from '../../state';
import { useForumViewerSync, useReports, useResolveReport } from './api';
import { authorName } from './lib/authors';
import { safeLink } from './lib/links';
import { reasonLabel } from './lib/reports';
import type { ReportOut } from '../../api/types';
import type { ReportStatus, ReportTargetStatus, ReportTargetType } from './types';
import { LoadError, LoadMore } from './components/LoadStates';
import './components/dialogs.css';
import './ReportsQueue.css';

const STATUSES: { id: ReportStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
];

const TARGET: Record<ReportTargetType, { label: string; icon: typeof ChatCircleText }> = {
  thread: { label: 'Thread', icon: ChatCircleText },
  reply: { label: 'Reply', icon: ArrowBendUpLeft },
  library_item: { label: 'Library file', icon: FileText },
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

/** Where the reported thing is: a page of the app (internal paths only). */
function TargetLink({ report }: { report: ReportOut }) {
  const gone = report.targetType === 'library_item' ? 'A file that no longer exists' : 'A post that no longer exists';
  const title = report.targetTitle?.trim() || gone;
  const link = report.targetUrl ? safeLink(report.targetUrl) : null;
  if (link?.kind === 'internal') {
    return (
      <Link to={link.to} className="forum-reports__target" dir="auto">
        {report.targetType === 'reply' ? <span className="forum-reports__in">Reply in </span> : null}
        {title}
        <ArrowSquareOut aria-hidden="true" className="forum-reports__go" />
      </Link>
    );
  }
  return (
    <span className="forum-reports__target is-gone" dir="auto">
      {title}
    </span>
  );
}

const STATUS_BADGE: Partial<Record<ReportTargetStatus, { label: string; tone: 'alert' | 'neutral' | 'outline' }>> = {
  hidden: { label: 'Hidden', tone: 'alert' },
  deleted: { label: 'Deleted', tone: 'neutral' },
  removed: { label: 'Removed', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  pending: { label: 'Waiting for review', tone: 'outline' },
};

function ReportCard({ report, onDecide }: { report: ReportOut; onDecide: (r: ReportOut, status: 'resolved' | 'dismissed') => void }) {
  const target = TARGET[report.targetType];
  const Icon = target.icon;
  const now = report.targetStatus ? STATUS_BADGE[report.targetStatus] : undefined;
  return (
    <li className="forum-reports__item" data-hub="report">
      <div className="forum-reports__icon" aria-hidden="true">
        <Icon weight="duotone" />
      </div>
      <div className="forum-reports__main">
        <p className="forum-reports__kind">
          {target.label}
          {report.targetAuthor ? ` by ${authorName(report.targetAuthor)}` : ''}
          <span aria-hidden="true"> · </span>
          <time dateTime={report.createdAt}>reported {timeAgo(report.createdAt)}</time>
        </p>
        <TargetLink report={report} />
        {report.targetExcerpt ? (
          <p className="forum-reports__excerpt" dir="auto">
            {report.targetExcerpt}
          </p>
        ) : null}
        <div className="forum-reports__meta">
          <Badge tone={report.reason === 'harassment' ? 'alert' : 'neutral'} size="sm" icon={Flag}>
            {reasonLabel(report.reason)}
          </Badge>
          {now ? (
            <Badge tone={now.tone} size="sm">
              {now.label}
            </Badge>
          ) : null}
          {/* Who reported is only shown to admins: student reps are classmates. */}
          {report.reporter ? <span>Reported by {authorName(report.reporter)}</span> : null}
        </div>
        {report.note ? (
          <blockquote className="forum-reports__note" dir="auto">
            {report.note}
          </blockquote>
        ) : null}
        {report.status !== 'open' ? (
          <p className="forum-reports__outcome">
            {report.status === 'resolved' ? (
              <CheckCircle weight="fill" aria-hidden="true" className="is-resolved" />
            ) : (
              <XCircle weight="fill" aria-hidden="true" className="is-dismissed" />
            )}
            <span>
              {report.status === 'resolved' ? 'Resolved' : 'Dismissed'}
              {report.resolvedBy ? ` by ${authorName(report.resolvedBy)}` : ''}
              {report.resolvedAt ? `, ${timeAgo(report.resolvedAt)}` : ''}
              {report.resolutionNote ? (
                <>
                  : <span dir="auto">{report.resolutionNote}</span>
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>
      {report.status === 'open' ? (
        <div className="forum-reports__actions">
          <Button size="sm" variant="primary" leadingIcon={CheckCircle} onClick={() => onDecide(report, 'resolved')}>
            Resolve
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecide(report, 'dismissed')}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function DecideDialog({ decision, onClose }: { decision: { report: ReportOut; status: 'resolved' | 'dismissed' } | null; onClose: () => void }) {
  const resolve = useResolveReport();
  const { push } = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const status = decision?.status ?? 'resolved';

  const close = () => {
    if (resolve.isPending) return;
    onClose();
    setNote('');
    setError(null);
  };
  const confirm = () => {
    if (!decision) return;
    resolve.mutate(
      { reportId: decision.report.id, status, note: note.trim() || null },
      {
        onSuccess: () => {
          push({ title: status === 'resolved' ? 'Report resolved' : 'Report dismissed', body: 'The person who reported it has been told.', tone: 'success' });
          setNote('');
          setError(null);
          onClose();
        },
        onError: (e) => {
          if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
            push({ title: 'Someone got there first', body: 'Another rep already closed this report.', tone: 'info' });
            onClose();
            return;
          }
          setError(errorMessage(e, "That didn't work. Try again."));
        },
      },
    );
  };

  return (
    <Modal
      open={!!decision}
      onClose={close}
      size="sm"
      title={status === 'resolved' ? 'Resolve this report' : 'Dismiss this report'}
      description={
        status === 'resolved'
          ? 'Resolve it once you have dealt with the post, for example by hiding it.'
          : 'Dismiss it when the post is fine as it is. Nothing changes on the post.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={resolve.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} loading={resolve.isPending} data-hub="report-decide">
            {status === 'resolved' ? 'Resolve report' : 'Dismiss report'}
          </Button>
        </>
      }
    >
      <div className="forum-confirm">
        <TextArea
          label="Note"
          hint="Optional. What you did, or why nothing needed doing. Other reps see it."
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-autofocus
          dir="auto"
        />
        {error ? (
          <p className="forum-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function ReportList({ status }: { status: ReportStatus }) {
  const reports = useReports(status);
  const [decision, setDecision] = useState<{ report: ReportOut; status: 'resolved' | 'dismissed' } | null>(null);
  const items = useMemo(() => flatten(reports.data?.pages), [reports.data]);
  const total = reports.data?.pages[0]?.total ?? 0;

  if (reports.isPending) {
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
  if (reports.isError && !reports.data) {
    const forbidden = reports.error instanceof ApiError && (reports.error.status === 403 || reports.error.status === 401);
    return forbidden ? (
      <Panel padding="none">
        <EmptyState icon={Flag} title="Only student reps and admins see reports" body="Ask an admin if you should have access." />
      </Panel>
    ) : (
      <LoadError error={reports.error} title="Couldn't load the reports" onRetry={() => void reports.refetch()} />
    );
  }
  if (!items.length) {
    const empty = {
      open: { title: 'No open reports', body: 'When someone reports a post or a file, it shows up here.' },
      resolved: { title: 'No resolved reports yet', body: 'Reports you act on move here, with your note.' },
      dismissed: { title: 'No dismissed reports', body: 'Reports that needed no action move here.' },
    }[status];
    return (
      <Panel padding="none">
        <EmptyState icon={status === 'open' ? CheckCircle : Flag} title={empty.title} body={empty.body} />
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
        <LoadMore noun="reports" remaining={total - items.length} loading={reports.isFetchingNextPage} onClick={() => void reports.fetchNextPage()} />
      ) : null}
      <DecideDialog decision={decision} onClose={() => setDecision(null)} />
    </>
  );
}

/** The moderators' list of reports: open, resolved and dismissed. */
export function ReportsQueue() {
  useForumViewerSync();
  const { isModerator, status: authStatus } = useAuth();
  const [status, setStatus] = useState<ReportStatus>('open');
  const open = useReports('open', { enabled: isModerator });
  const openCount = open.data?.pages[0]?.total;

  if (authStatus !== 'loading' && !isModerator) {
    return (
      <Panel padding="none">
        <EmptyState icon={Flag} title="Only student reps and admins see reports" body="Ask an admin if you should have access." />
      </Panel>
    );
  }

  return (
    <section className="forum-reports" aria-label="Reports" data-hub="reports-queue">
      <Tabs
        idBase="reports"
        label="Reports by status"
        className="forum-reports__tabs"
        tabs={STATUSES.map((s) => ({ id: s.id, label: s.label, count: s.id === 'open' ? openCount : undefined }))}
        value={status}
        onChange={(id: string) => setStatus(STATUSES.find((s) => s.id === id)?.id ?? 'open')}
      />
      <TabPanel idBase="reports" id={status} value={status} className="forum-reports__panel">
        {isModerator ? <ReportList key={status} status={status} /> : null}
      </TabPanel>
    </section>
  );
}
