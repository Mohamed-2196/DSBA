import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IssueSummary } from '../../api/types';
import { useAuth } from '../../auth';
import { formatDay, formatMonthYear, parseDay } from '../../lib/dates';
import { useDocumentTitle } from '../../state';
import { Badge, Button, glyph, Icon, IconButton, Page, PageHeader, Panel, QueryError, Skeleton } from '../../ui';
import { toCard, useIssueDetails, useIssues, useNewsletterMasthead } from './api';
import { DeleteIssueButton, PublishButton } from './components/IssueActions';
import { IssueCover } from './components/IssueCover';
import { SubscribeBox } from './components/SubscribeBox';
import { issueNo, plainText, sectionLabel } from './lib/text';
import { NewIssueDialog } from './NewIssueDialog';
import type { IssueCard } from './types';
import './NewsletterPage.css';

const issueHref = (issue: { slug: string }, section?: string): string =>
  `/newsletter/${issue.slug}${section ? `?section=${section}` : ''}`;

/** The tools band: the newsletter's name, its line, and since when and the latest issue. The nameplate is on the covers. */
function Masthead({ first, latest }: { first: IssueCard | undefined; latest: IssueCard | undefined }) {
  const line = useNewsletterMasthead().data?.masthead;
  return (
    <PageHeader
      section="tools"
      className="nl-index__head"
      title="The DSBA Newsletter"
      description={line ?? <Skeleton width="20em" height="1em" />}
      meta={
        first || latest ? (
          <dl className="nl-index__facts" data-hub="nl-masthead">
            {first ? (
              <div className="nl-index__fact">
                <dt>Since</dt>
                <dd>{formatMonthYear(parseDay(first.date))}</dd>
              </div>
            ) : null}
            {latest ? (
              <div className="nl-index__fact">
                <dt>Latest issue</dt>
                <dd className="u-tabular">{formatDay(latest.date)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null
      }
    />
  );
}

function LatestFeature({ issue }: { issue: IssueCard }) {
  const no = issueNo(issue.number);
  return (
    <section className="nl-feature" data-hub="latest-issue" aria-labelledby="nl-latest-title">
      <Link to={issueHref(issue)} className="nl-feature__cover" tabIndex={-1} aria-hidden="true">
        <IssueCover issue={issue} decorative />
      </Link>
      <div className="nl-feature__body">
        <p className="nl-feature__kicker">
          <Badge tone="highlight">New</Badge>
          <span>
            Issue {no}, {formatDay(issue.date)}
          </span>
        </p>
        <h2 id="nl-latest-title" className="nl-feature__title">
          <Link to={issueHref(issue)}>{issue.title}</Link>
        </h2>
        {issue.dek ? <p className="nl-feature__dek">{issue.dek}</p> : null}
        {issue.summary ? <p className="nl-feature__summary">{issue.summary}</p> : null}
        {issue.sections?.length ? (
          <nav className="nl-feature__contents" aria-label={`In issue ${no}`}>
            <h3 className="nl-feature__contents-title">In this issue</h3>
            <ol role="list">
              {issue.sections.map((s) => (
                <li key={s.id}>
                  <Link to={issueHref(issue, s.id)}>{plainText(sectionLabel(s))}</Link>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <div className="nl-feature__actions">
          <Button variant="primary" size="lg" to={issueHref(issue)}>
            Read issue {no}
          </Button>
          {issue.readMinutes ? (
            <span className="nl-feature__time">
              <Icon glyph={glyph.clock} />
              {issue.readMinutes} min read
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** No issue is out yet: what the newsletter will be, and how to get the first one. */
function ComingSoon({ manages, hasDrafts }: { manages: boolean; hasDrafts: boolean }) {
  return (
    <section className="nl-feature nl-feature--soon" data-hub="newsletter-empty" aria-labelledby="nl-soon-title">
      <div className="nl-feature__cover nl-soon__cover">
        <img
          src={`${import.meta.env.BASE_URL}brand/newsletter-cover.jpg`}
          alt="The DSBA Newsletter illustration"
          className="nl-soon__art"
          width={1086}
          height={1448}
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="nl-feature__body">
        <p className="nl-feature__kicker">
          <Badge tone="outline">Coming soon</Badge>
          <span>The first issue</span>
        </p>
        <h2 id="nl-soon-title" className="nl-feature__title">
          The first issue is on its way
        </h2>
        <p className="nl-feature__dek">News from the programme, written by DSBA students for DSBA students.</p>
        <p className="nl-feature__summary">
          {manages
            ? hasDrafts
              ? 'Nothing is published yet. Check a draft above, then publish it: everyone who wants to hear about new issues gets a notification.'
              : 'Nothing is published yet. Start a new issue above: it stays a draft until you publish it.'
            : 'There’s no timetable: an issue goes out when there’s news worth your time. Subscribe and you’ll hear the moment the first one is out.'}
        </p>
        <div className="nl-feature__contents nl-soon__contents">
          <h3 className="nl-feature__contents-title">What an issue can hold</h3>
          <ul role="list" className="nl-soon__list">
            <li>
              <b>News from around the programme:</b> what changed on the Hub and what’s happening at BIBF.
            </li>
            <li>
              <b>Deadlines and dates:</b> every exam and deadline for your cohort, with a countdown.
            </li>
            <li>
              <b>From the forum and the library:</b> the threads people are talking about and the newest files.
            </li>
            <li>
              <b>Study tips and spotlights:</b> one technique at a time, and classmates on how they actually study.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function ShelfItem({ issue }: { issue: IssueCard }) {
  return (
    <li className="nl-shelf__item">
      <Link to={issueHref(issue)} className="nl-shelf__link">
        <IssueCover issue={issue} decorative />
        <span className="nl-shelf__no">Issue {issueNo(issue.number)}</span>
        <span className="nl-shelf__title">{issue.title}</span>
        <span className="nl-shelf__meta">
          <span className="u-tabular">{formatDay(issue.date, { month: 'short' })}</span>
          {issue.readMinutes ? (
            <span className="nl-shelf__time">
              <Icon glyph={glyph.clock} />
              {issue.readMinutes} min read
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/** Moderators: the drafts, and a way to start a new issue. */
function Drafts({ drafts, onNew }: { drafts: IssueSummary[]; onNew: () => void }) {
  return (
    <Panel padding="none" className="nl-drafts" aria-labelledby="nl-drafts-title" data-hub="newsletter-drafts">
      <div className="nl-drafts__head">
        <div>
          <h2 id="nl-drafts-title" className="nl-drafts__title">
            <Icon glyph={glyph.edit} />
            Drafts
            <span className="nl-drafts__count u-tabular">{drafts.length}</span>
          </h2>
          <p className="nl-drafts__desc">
            Only people who manage the newsletter see these. Publishing an issue tells everyone it’s out.
          </p>
        </div>
        <Button variant="primary" leadingIcon={<Icon glyph={glyph.plus} />} onClick={onNew} data-hub="issue-new">
          New issue
        </Button>
      </div>
      {drafts.length ? (
        <ul role="list" className="nl-drafts__list">
          {drafts.map((d) => (
            <li key={d.id} className="nl-drafts__row" data-issue-slug={d.slug}>
              <span className="nl-drafts__no u-tabular">{issueNo(d.number)}</span>
              <span className="nl-drafts__text">
                <Link to={issueHref(d)} className="nl-drafts__name">
                  {d.title}
                </Link>
                <span className="nl-drafts__meta">
                  <Badge tone="highlight" size="sm">
                    Draft
                  </Badge>
                  <span className="u-tabular">{formatDay(d.date, { month: 'short' })}</span>
                </span>
              </span>
              <span className="nl-drafts__actions">
                <IconButton
                  label={`Preview issue ${issueNo(d.number)}`}
                  icon={<Icon glyph={glyph.eye} />}
                  variant="secondary"
                  size="sm"
                  tooltip
                  to={issueHref(d)}
                />
                <IconButton
                  label={`Edit issue ${issueNo(d.number)}`}
                  icon={<Icon glyph={glyph.edit} />}
                  variant="secondary"
                  size="sm"
                  tooltip
                  to={`/newsletter/${d.slug}/edit`}
                />
                <DeleteIssueButton issue={d} iconOnly size="sm" />
                <PublishButton issue={d} size="sm" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nl-drafts__empty">No drafts. Start a new issue when there’s news to share.</p>
      )}
    </Panel>
  );
}

function NewsletterSkeleton() {
  return (
    <section className="nl-feature" aria-busy="true">
      <span className="visually-hidden">Loading the newsletter</span>
      <div className="nl-feature__cover" aria-hidden="true">
        <Skeleton height={360} radius={4} />
      </div>
      <div className="nl-feature__body" aria-hidden="true">
        <Skeleton width={160} height={20} />
        <Skeleton width="80%" height={64} style={{ marginTop: 16 }} />
        <Skeleton width="60%" height={28} style={{ marginTop: 16 }} />
        <Skeleton lines={3} style={{ marginTop: 24 }} />
      </div>
    </section>
  );
}

export default function NewsletterPage() {
  useDocumentTitle('The DSBA Newsletter');
  const { can } = useAuth();
  const manages = can('newsletter.manage');
  const list = useIssues({ includeDrafts: manages });
  const [creating, setCreating] = useState(false);

  const all = list.data;
  const published = useMemo(() => (all ?? []).filter((i) => i.status === 'published'), [all]);
  const drafts = useMemo(() => (manages ? (all ?? []).filter((i) => i.status === 'draft') : []), [all, manages]);
  // The covers and read times need each issue's sections: read the details of the issues on the page.
  const details = useIssueDetails(published.slice(0, 12).map((i) => i.slug));
  const cards = published.map((summary) => toCard(summary, details.find((d) => d.data?.slug === summary.slug)?.data));
  const latest = cards[0];
  const nextNumber = Math.max(1, ...(all ?? []).map((i) => i.number + 1));

  return (
    <Page className="nl-index">
      <Masthead first={cards[cards.length - 1]} latest={latest} />

      {manages && all ? <Drafts drafts={drafts} onNew={() => setCreating(true)} /> : null}

      {list.isPending ? (
        <NewsletterSkeleton />
      ) : list.isError ? (
        <QueryError
          error={list.error}
          title="The newsletter didn’t load"
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : latest ? (
        <LatestFeature issue={latest} />
      ) : (
        <ComingSoon manages={manages} hasDrafts={drafts.length > 0} />
      )}

      {cards.length ? (
        <section className="nl-archive" aria-labelledby="nl-archive-title">
          <div className="nl-archive__head">
            <h2 id="nl-archive-title" className="nl-archive__title">
              All issues
            </h2>
            <p className="nl-archive__desc">Every issue so far, newest first.</p>
          </div>
          <div className="nl-archive__layout">
            <ol role="list" className="nl-shelf">
              {cards.map((issue) => (
                <ShelfItem key={issue.slug} issue={issue} />
              ))}
            </ol>
            <SubscribeBox className="nl-archive__subscribe" />
          </div>
        </section>
      ) : list.isSuccess ? (
        <SubscribeBox variant="band" className="nl-soon__subscribe" />
      ) : null}

      {manages ? <NewIssueDialog open={creating} nextNumber={nextNumber} onClose={() => setCreating(false)} /> : null}
    </Page>
  );
}
