import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Eye, NotePencil, PencilSimple, Plus, WarningCircle } from '@phosphor-icons/react';
import type { IssueSummary } from '../../api/types';
import { useAuth } from '../../auth';
import { useDocumentTitle } from '../../state';
import { Badge, Button, EmptyState, IconButton, Page, Panel, Skeleton } from '../../ui';
import { toCard, useIssueDetails, useIssues } from './api';
import { DeleteIssueButton, PublishButton } from './components/IssueActions';
import { IssueCover, type CoverIssue } from './components/IssueCover';
import { Nameplate } from './components/Nameplate';
import { SubscribeBox } from './components/SubscribeBox';
import { issueNo, longDate, parseDay, shortDate } from './lib/text';
import { NewIssueDialog } from './NewIssueDialog';
import type { IssueCard } from './types';
import './NewsletterPage.css';

const issueHref = (issue: { slug: string }, section?: string): string => `/newsletter/${issue.slug}${section ? `?section=${section}` : ''}`;

function Masthead({ first, latest }: { first: IssueCard | undefined; latest: IssueCard | undefined }) {
  return (
    <header className="nl-masthead" data-hub="nl-masthead">
      <h1 className="nl-masthead__title">
        <Nameplate />
      </h1>
      <div className="nl-masthead__rules" aria-hidden="true" />
      <div className="nl-masthead__folio">
        <p className="nl-masthead__tagline">News from the DSBA programme, written by students for students. We publish when there’s something worth your time.</p>
        <dl className="nl-masthead__facts">
          {first ? (
            <div className="nl-masthead__fact">
              <dt>Since</dt>
              <dd>{parseDay(first.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</dd>
            </div>
          ) : null}
          {latest ? (
            <div className="nl-masthead__fact">
              <dt>Latest issue</dt>
              <dd className="u-tabular">{longDate(latest.date)}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </header>
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
            Issue {no}, {longDate(issue.date)}
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
                  <Link to={issueHref(issue, s.id)}>{s.label}</Link>
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
              <Clock aria-hidden="true" />
              {issue.readMinutes} min read
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// The cover of the issue to come: the same type cover, with what an issue can hold as its index.
const SOON_COVER: CoverIssue = {
  number: 1,
  title: 'Coming soon',
  date: '',
  cover: {
    tone: 'paper',
    art: null,
    lines: [
      { section: 'news', text: 'What changed on the Hub' },
      { section: 'cohorts', text: 'News for your year' },
      { section: 'deadlines', text: 'Every exam, with a countdown' },
      { section: 'forum', text: 'What your cohort is asking' },
      { section: 'library', text: 'Fresh notes and past papers' },
    ],
  },
  sections: [
    { id: 'news', label: 'News' },
    { id: 'cohorts', label: 'Cohort corner' },
    { id: 'deadlines', label: 'Deadlines and dates' },
    { id: 'forum', label: 'From the forum' },
    { id: 'library', label: 'New in the library' },
  ],
};

/** No issue is out yet: what the newsletter will be, and how to get the first one. */
function ComingSoon({ isModerator, hasDrafts }: { isModerator: boolean; hasDrafts: boolean }) {
  return (
    <section className="nl-feature nl-feature--soon" data-hub="newsletter-empty" aria-labelledby="nl-soon-title">
      <div className="nl-feature__cover nl-soon__cover">
        <IssueCover issue={SOON_COVER} decorative />
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
          {isModerator
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
          <span className="u-tabular">{shortDate(issue.date)}</span>
          {issue.readMinutes ? (
            <span className="nl-shelf__time">
              <Clock aria-hidden="true" />
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
            <NotePencil weight="duotone" aria-hidden="true" />
            Drafts
            <span className="nl-drafts__count u-tabular">{drafts.length}</span>
          </h2>
          <p className="nl-drafts__desc">Only student reps see these. Publishing an issue tells everyone it’s out.</p>
        </div>
        <Button variant="primary" leadingIcon={Plus} onClick={onNew} data-hub="issue-new">
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
                  <span className="u-tabular">{shortDate(d.date)}</span>
                </span>
              </span>
              <span className="nl-drafts__actions">
                <IconButton label={`Preview issue ${issueNo(d.number)}`} icon={Eye} variant="secondary" size="sm" tooltip to={issueHref(d)} />
                <IconButton label={`Edit issue ${issueNo(d.number)}`} icon={PencilSimple} variant="secondary" size="sm" tooltip to={`/newsletter/${d.slug}/edit`} />
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
  const { isModerator } = useAuth();
  const list = useIssues({ includeDrafts: isModerator });
  const [creating, setCreating] = useState(false);

  const all = list.data;
  const published = useMemo(() => (all ?? []).filter((i) => i.status === 'published'), [all]);
  const drafts = useMemo(() => (isModerator ? (all ?? []).filter((i) => i.status === 'draft') : []), [all, isModerator]);
  // The covers and read times need each issue's sections: read the details of the issues on the page.
  const details = useIssueDetails(published.slice(0, 12).map((i) => i.slug));
  const cards = published.map((summary) => toCard(summary, details.find((d) => d.data?.slug === summary.slug)?.data));
  const latest = cards[0];
  const nextNumber = Math.max(1, ...(all ?? []).map((i) => i.number + 1));

  return (
    <Page className="nl-index">
      <Masthead first={cards[cards.length - 1]} latest={latest} />

      {isModerator && all ? <Drafts drafts={drafts} onNew={() => setCreating(true)} /> : null}

      {list.isPending ? (
        <NewsletterSkeleton />
      ) : list.isError ? (
        <Panel padding="none">
          <EmptyState
            icon={WarningCircle}
            title="The newsletter didn’t load"
            body="Check your connection, then try again."
            action={
              <Button onClick={() => void list.refetch()} loading={list.isFetching}>
                Try again
              </Button>
            }
          />
        </Panel>
      ) : latest ? (
        <LatestFeature issue={latest} />
      ) : (
        <ComingSoon isModerator={isModerator} hasDrafts={drafts.length > 0} />
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

      {isModerator ? <NewIssueDialog open={creating} nextNumber={nextNumber} onClose={() => setCreating(false)} /> : null}
    </Page>
  );
}
