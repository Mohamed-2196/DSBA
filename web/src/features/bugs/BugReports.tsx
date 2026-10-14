// Manage's Bugs section (admins): the reports, open first, each marked fixed or won't fix, or opened again.
import { Bug } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { remainingCount } from '../../api/paging';
import type { BugReportOut } from '../../api/types';
import { useToast } from '../../state';
import { Button, EmptyState, Panel, QueryError, SegmentedControl, Skeleton, safeInternalPath, timeAgo } from '../../ui';
import { useBugReports, useSetBugStatus, type BugStatus } from './api';
import './BugReport.css';

const STATUS_LABEL: Record<BugStatus, string> = { open: 'Open', fixed: 'Fixed', wont_fix: 'Won’t fix' };
const EMPTY: Record<BugStatus, string> = {
  open: 'No open bug reports. New ones show here, and admins get a notification.',
  fixed: 'Nothing marked fixed yet.',
  wont_fix: 'Nothing marked won’t fix.',
};

function BugCard({ bug }: { bug: BugReportOut }) {
  const setStatus = useSetBugStatus();
  const { push } = useToast();
  const page = safeInternalPath(bug.pageUrl);
  const mark = (status: BugStatus, done: string) =>
    setStatus.mutate(
      { id: bug.id, status },
      {
        onSuccess: () => push({ tone: 'success', title: done }),
        onError: (e) => push({ tone: 'alert', title: 'The report wasn’t updated', body: errorMessage(e, 'Try again in a moment.') }),
      },
    );
  const busy = setStatus.isPending;
  return (
    <li className="bug-card" data-hub="bug-card">
      <p className="bug-card__head">
        <span>{bug.reporter ? bug.reporter.displayName : 'A guest'}</span>
        <time dateTime={bug.createdAt}>{timeAgo(bug.createdAt)}</time>
      </p>
      <p className="bug-card__what">{bug.whatHappened}</p>
      {bug.expected ? <p className="bug-card__expected">Expected: {bug.expected}</p> : null}
      {bug.screenshotUrl ? (
        <a className="bug-card__shot" href={bug.screenshotUrl} target="_blank" rel="noopener noreferrer">
          <img src={bug.screenshotUrl} alt={`Screenshot sent with the report: ${bug.whatHappened.slice(0, 80)}`} loading="lazy" />
        </a>
      ) : null}
      <dl className="bug-card__meta">
        <dt>Page</dt>
        <dd>{page ? <Link to={page}>{bug.pageUrl}</Link> : bug.pageUrl}</dd>
        <dt>Version</dt>
        <dd className="u-code">{bug.appVersion}</dd>
        {bug.browser ? (
          <>
            <dt>Browser</dt>
            <dd>{bug.browser}</dd>
          </>
        ) : null}
        {bug.resolvedBy && bug.resolvedAt ? (
          <>
            <dt>{STATUS_LABEL[bug.status]}</dt>
            <dd>
              {bug.resolvedBy.displayName}, {timeAgo(bug.resolvedAt)}
            </dd>
          </>
        ) : null}
      </dl>
      <div className="bug-card__actions">
        {bug.status === 'open' ? (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => mark('fixed', 'Marked fixed')}>
              Mark fixed
            </Button>
            <Button size="sm" disabled={busy} onClick={() => mark('wont_fix', 'Marked won’t fix')}>
              Won’t fix
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => mark('open', 'Opened again')}>
            Open again
          </Button>
        )}
      </div>
    </li>
  );
}

export function BugReports() {
  const [status, setStatus] = useState<BugStatus>('open');
  const list = useBugReports(status);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const more = remainingCount(list.data?.pages);
  return (
    <div className="bugs" data-hub="manage-bugs">
      <SegmentedControl<BugStatus>
        label="Show"
        value={status}
        onChange={setStatus}
        options={(['open', 'fixed', 'wont_fix'] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
      />
      {list.isPending ? (
        <Panel padding="md" aria-busy="true">
          <Skeleton lines={3} />
        </Panel>
      ) : list.isError ? (
        <QueryError error={list.error} title="Bug reports didn’t load" onRetry={() => void list.refetch()} retrying={list.isFetching} size="sm" />
      ) : items.length === 0 ? (
        <Panel padding="none">
          <EmptyState size="sm" icon={Bug} title={status === 'open' ? 'No open bugs' : `Nothing ${STATUS_LABEL[status].toLowerCase()}`} body={EMPTY[status]} />
        </Panel>
      ) : (
        <>
          <ul role="list" className="bugs-list">
            {items.map((b) => (
              <BugCard key={b.id} bug={b} />
            ))}
          </ul>
          {more > 0 ? (
            <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Show {more} more
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
