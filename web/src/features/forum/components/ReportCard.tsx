// One report in the moderators' queue (ReportsQueue.tsx): what was reported, why, by whom (admins only), what the
// post is now, and Resolve / Dismiss while it is open.
import { Link } from 'react-router-dom';
import { ArrowBendUpLeft, ArrowSquareOut, ChatCircleText, CheckCircle, FileText, Flag, HandWaving, XCircle } from '@phosphor-icons/react';
import type { ReportOut } from '../../../api/types';
import { Badge, Button, timeAgo } from '../../../ui';
import { authorName } from '../lib/authors';
import { safeLink } from '../lib/links';
import { reasonLabel } from '../lib/reports';
import type { ReportTargetStatus, ReportTargetType } from '../types';

export type Decision = 'resolved' | 'dismissed';

const TARGET: Record<ReportTargetType, { label: string; icon: typeof ChatCircleText }> = {
  thread: { label: 'Thread', icon: ChatCircleText },
  reply: { label: 'Reply', icon: ArrowBendUpLeft },
  library_item: { label: 'Library file', icon: FileText },
  request: { label: 'Request', icon: HandWaving },
};

const STATUS_BADGE: Partial<Record<ReportTargetStatus, { label: string; tone: 'alert' | 'neutral' | 'outline' }>> = {
  hidden: { label: 'Hidden', tone: 'alert' },
  deleted: { label: 'Deleted', tone: 'neutral' },
  removed: { label: 'Removed', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  pending: { label: 'Waiting for review', tone: 'outline' },
};

const GONE: Record<ReportTargetType, string> = {
  thread: 'A post that no longer exists',
  reply: 'A post that no longer exists',
  library_item: 'A file that no longer exists',
  request: 'A request that no longer exists',
};

/** Where the reported thing is: a page of the app (internal paths only). */
function TargetLink({ report }: { report: ReportOut }) {
  const gone = GONE[report.targetType];
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

export function ReportCard({ report, onDecide }: { report: ReportOut; onDecide: (r: ReportOut, status: Decision) => void }) {
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
