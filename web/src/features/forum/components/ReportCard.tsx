// One report in the moderators' queue (ReportsQueue.tsx): what was reported, why, by whom (admins only), what the
// post is now, and Resolve / Dismiss while it is open. A report from the Hub's automatic check (fromHub) names what
// closing it does instead (lib/hubReports.ts), and a reported picture shows behind a "Show picture" button.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReportOut } from '../../../api/types';
import { Badge, Button, timeAgo, glyph, Icon, type Glyph } from '../../../ui';
import { authorName } from '../lib/authors';
import { hubDecision } from '../lib/hubReports';
import { mediaSrc, safeLink } from '../lib/links';
import { reasonLabel } from '../lib/reports';
import type { QueueTargetType, ReportTargetStatus } from '../types';

export type Decision = 'resolved' | 'dismissed';

const TARGET: Record<QueueTargetType, { label: string; icon: Glyph }> = {
  image: { label: 'Picture', icon: glyph.image },
  thread: { label: 'Thread', icon: glyph.chat },
  reply: { label: 'Reply', icon: glyph.reply },
  library_item: { label: 'Library file', icon: glyph.page },
  request: { label: 'Request', icon: glyph.hand },
  shared_note: { label: 'Shared note', icon: glyph.notebook },
};

const STATUS_BADGE: Partial<Record<ReportTargetStatus, { label: string; tone: 'alert' | 'neutral' | 'outline' }>> = {
  hidden: { label: 'Hidden', tone: 'alert' },
  deleted: { label: 'Deleted', tone: 'neutral' },
  removed: { label: 'Removed', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  pending: { label: 'Waiting for review', tone: 'outline' },
};

const GONE: Record<QueueTargetType, string> = {
  image: 'A picture not in a post yet',
  thread: 'A post that no longer exists',
  reply: 'A post that no longer exists',
  library_item: 'A file that no longer exists',
  request: 'A request that no longer exists',
  shared_note: 'A shared note that no longer exists',
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
        {report.targetType === 'image' ? <span className="forum-reports__in">Picture in </span> : null}
        {title}
        <Icon glyph={glyph.external} aria-hidden="true" className="forum-reports__go" />
      </Link>
    );
  }
  return (
    <span className="forum-reports__target is-gone" dir="auto">
      {title}
    </span>
  );
}

/** The reported picture, covered until the rep chooses to look (it may be what the check flagged). */
function ReportedPicture({ src }: { src: string }) {
  const [shown, setShown] = useState(false);
  const url = mediaSrc(src);
  if (!url) return null;
  return (
    <div className={`forum-reports__picture${shown ? ' is-shown' : ''}`}>
      {shown ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt="The reported picture" loading="lazy" decoding="async" />
          <span className="visually-hidden"> (opens full size in a new tab)</span>
        </a>
      ) : (
        <Button size="sm" variant="secondary" leadingIcon={<Icon glyph={glyph.eye} />} onClick={() => setShown(true)}>
          Show picture
        </Button>
      )}
    </div>
  );
}

export function ReportCard({
  report,
  onDecide,
}: {
  report: ReportOut;
  onDecide: (r: ReportOut, status: Decision) => void;
}) {
  const target = TARGET[report.targetType];
  const targetGlyph = target.icon;
  const now = report.targetStatus ? STATUS_BADGE[report.targetStatus] : undefined;
  const hub = hubDecision(report);
  return (
    <li className="forum-reports__item" data-hub="report">
      <div className="forum-reports__icon" aria-hidden="true">
        <Icon glyph={targetGlyph} />
      </div>
      <div className="forum-reports__main">
        <p className="forum-reports__kind">
          {target.label}
          {report.targetAuthor ? ` by ${authorName(report.targetAuthor)}` : ''}
          <span aria-hidden="true"> · </span>
          <time dateTime={report.createdAt}>
            {report.fromHub ? 'flagged' : 'reported'} {timeAgo(report.createdAt)}
          </time>
        </p>
        <TargetLink report={report} />
        {report.targetImage ? <ReportedPicture src={report.targetImage} /> : null}
        {report.targetExcerpt ? (
          <p className="forum-reports__excerpt" dir="auto">
            {report.targetExcerpt}
          </p>
        ) : null}
        <div className="forum-reports__meta">
          <Badge
            tone={report.reason === 'harassment' || report.reason === 'hub_flagged' ? 'alert' : 'neutral'}
            size="sm"
            icon={<Icon glyph={glyph.flag} />}
          >
            {reasonLabel(report.reason)}
          </Badge>
          {now ? (
            <Badge tone={now.tone} size="sm">
              {now.label}
            </Badge>
          ) : null}
          {/* Who reported is only shown to admins: student reps are classmates. */}
          {report.reporter ? <span>Reported by {authorName(report.reporter)}</span> : null}
          {report.fromHub ? <span>From the Hub’s automatic check</span> : null}
        </div>
        {report.note ? (
          <blockquote className="forum-reports__note" dir="auto">
            {report.note}
          </blockquote>
        ) : null}
        {report.status !== 'open' ? (
          <p className="forum-reports__outcome">
            {report.status === 'resolved' ? (
              <Icon glyph={glyph.success} active aria-hidden="true" className="is-resolved" />
            ) : (
              <Icon glyph={glyph.close} active aria-hidden="true" className="is-dismissed" />
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
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<Icon glyph={glyph.success} />}
            onClick={() => onDecide(report, 'resolved')}
          >
            {hub ? hub.resolve.label : 'Resolve'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDecide(report, 'dismissed')}>
            {hub ? hub.dismiss.label : 'Dismiss'}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
