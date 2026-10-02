import { Link } from 'react-router-dom';
import { Clock, Newspaper } from '@phosphor-icons/react';
import { Badge, EmptyState, Panel } from '../../ui';
import { IssueCover } from './components/IssueCover.jsx';
import { getLatest } from './lib/issues.js';
import { issueNo, shortDate } from './lib/text.js';
import './LatestIssueCard.css';

/** Home: the latest issue of The DSBA Newsletter as one link (compact cover, title, summary, read time). */
export function LatestIssueCard() {
  const issue = getLatest();
  if (!issue) {
    return (
      <Panel padding="none">
        <EmptyState size="sm" icon={Newspaper} title="No issues yet" body="The latest issue of The DSBA Newsletter will show here when there is one." />
      </Panel>
    );
  }
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
        <span className="nl-latest-card__summary">{issue.summary}</span>
        <span className="nl-latest-card__meta">
          <Clock aria-hidden="true" />
          {issue.readMinutes} min read
        </span>
      </span>
    </Link>
  );
}
