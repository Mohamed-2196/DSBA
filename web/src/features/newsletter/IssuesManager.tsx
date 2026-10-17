// Manage → Newsletter (newsletter.manage): every issue, drafts first then the published ones newest first, each with
// what can be done to it: open it, edit it, publish a draft, delete it. "New issue" starts a draft and opens its editor.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Newspaper, PencilSimple, Plus } from '@phosphor-icons/react';
import type { IssueSummary } from '../../api/types';
import { formatDay } from '../../lib/dates';
import { Badge, Button, EmptyState, IconButton, Panel, QueryError, Skeleton } from '../../ui';
import { useIssues } from './api';
import { DeleteIssueButton, PublishButton } from './components/IssueActions';
import { managerOrder } from './lib/manage';
import { issueNo } from './lib/text';
import { NewIssueDialog } from './NewIssueDialog';
import './NewsletterPage.css';

function Row({ issue }: { issue: IssueSummary }) {
  const no = issueNo(issue.number);
  const draft = issue.status === 'draft';
  return (
    <li className="nl-drafts__row" data-issue-slug={issue.slug}>
      <span className="nl-drafts__no u-tabular">{no}</span>
      <span className="nl-drafts__text">
        <Link to={`/newsletter/${issue.slug}`} className="nl-drafts__name">
          {issue.title}
        </Link>
        <span className="nl-drafts__meta">
          {draft ? (
            <Badge tone="highlight" size="sm">
              Draft
            </Badge>
          ) : (
            <Badge tone="signal" size="sm">
              Published
            </Badge>
          )}
          <span className="u-tabular">{formatDay(issue.date, { month: 'short' })}</span>
        </span>
      </span>
      <span className="nl-drafts__actions">
        <IconButton label={draft ? `Preview issue ${no}` : `Open issue ${no}`} icon={Eye} variant="secondary" size="sm" tooltip to={`/newsletter/${issue.slug}`} />
        <IconButton label={`Edit issue ${no}`} icon={PencilSimple} variant="secondary" size="sm" tooltip to={`/newsletter/${issue.slug}/edit`} />
        <DeleteIssueButton issue={issue} iconOnly size="sm" />
        {draft ? <PublishButton issue={issue} size="sm" /> : null}
      </span>
    </li>
  );
}

export function IssuesManager() {
  const list = useIssues({ includeDrafts: true });
  const [creating, setCreating] = useState(false);
  if (list.isError) return <QueryError error={list.error} title="The issues didn’t load" onRetry={() => void list.refetch()} retrying={list.isFetching} size="sm" />;
  const issues = managerOrder(list.data ?? []);
  const nextNumber = Math.max(1, ...issues.map((i) => i.number + 1));
  return (
    <Panel padding="none" className="nl-drafts nl-manage" aria-labelledby="nl-manage-title" data-hub="newsletter-manage">
      <div className="nl-drafts__head">
        <div>
          <h3 id="nl-manage-title" className="nl-drafts__title">
            Issues
            <span className="nl-drafts__count u-tabular">{issues.length}</span>
          </h3>
          <p className="nl-drafts__desc">Drafts are only for people who manage the newsletter. Publishing one tells everyone it’s out; what you save to a published issue shows straight away.</p>
        </div>
        <Button variant="primary" leadingIcon={Plus} onClick={() => setCreating(true)} data-hub="issue-new">
          New issue
        </Button>
      </div>
      {list.isPending ? (
        <div className="nl-drafts__empty">
          <Skeleton lines={4} />
        </div>
      ) : issues.length ? (
        <ul role="list" className="nl-drafts__list">
          {issues.map((i) => (
            <Row key={i.id} issue={i} />
          ))}
        </ul>
      ) : (
        <EmptyState size="sm" icon={Newspaper} title="No issues yet" body="Start the first one: it stays a draft until you publish it." />
      )}
      <NewIssueDialog open={creating} nextNumber={nextNumber} onClose={() => setCreating(false)} />
    </Panel>
  );
}
