import { Link } from 'react-router-dom';
import { Clock, Newspaper } from '@phosphor-icons/react';
import { Badge, Button, EmptyState, Panel, Skeleton } from '../../ui';
import { toCard, useIssueDetail, useLatestIssue } from './api';
import { IssueCover } from './components/IssueCover';
import { issueNo, shortDate } from './lib/text';
import './LatestIssueCard.css';

/** Home: the latest issue of The DSBA Newsletter as one link (compact cover, title, summary, read time). */
export function LatestIssueCard() {
  const latest = useLatestIssue();
  const detail = useIssueDetail(latest.data?.slug);

  if (latest.isPending) {
    return (
      <div className="nl-latest-card nl-latest-card--loading" aria-busy="true">
        <span className="visually-hidden">Loading the latest issue</span>
        <span className="nl-latest-card__cover" aria-hidden="true">
          <Skeleton height={139} radius={4} />
        </span>
        <span className="nl-latest-card__body" aria-hidden="true">
          <Skeleton width="60%" height={14} />
          <Skeleton width="85%" height={30} />
          <Skeleton lines={2} />
        </span>
      </div>
    );
  }
  if (latest.isError) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={Newspaper}
          title="The newsletter didn’t load"
          body="Check your connection, then try again."
          action={
            <Button size="sm" onClick={() => void latest.refetch()} loading={latest.isFetching}>
              Try again
            </Button>
          }
        />
      </Panel>
    );
  }
  const summary = latest.data;
  if (!summary) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={Newspaper}
          title="No issues yet"
          body="The first issue of The DSBA Newsletter will show here when it’s out."
          action={
            <Button size="sm" to="/newsletter">
              About the newsletter
            </Button>
          }
        />
      </Panel>
    );
  }
  const issue = toCard(summary, detail.data);
  return (
    <Link to={`/newsletter/${issue.slug}`} className="nl-latest-card" data-hub="latest-issue-card">
      <span className="nl-latest-card__cover">
        <IssueCover issue={issue} decorative />
      </span>
      <span className="nl-latest-card__body">
        <span className="nl-latest-card__kicker">
          <Badge tone="highlight" size="sm">
            New
          </Badge>
          <span>
            The DSBA Newsletter {issueNo(issue.number)}, {shortDate(issue.date)}
          </span>
        </span>
        <span className="nl-latest-card__title">{issue.title}</span>
        {issue.summary ? <span className="nl-latest-card__summary">{issue.summary}</span> : null}
        {issue.readMinutes ? (
          <span className="nl-latest-card__meta">
            <Clock aria-hidden="true" />
            {issue.readMinutes} min read
          </span>
        ) : null}
      </span>
    </Link>
  );
}
