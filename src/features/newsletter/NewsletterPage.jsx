import { Link } from 'react-router-dom';
import { Clock, Newspaper } from '@phosphor-icons/react';
import { Badge, Button, EmptyState, Page, Panel } from '../../ui';
import { useDocumentTitle } from '../../state';
import { IssueCover } from './components/IssueCover.jsx';
import { Nameplate } from './components/Nameplate.jsx';
import { SubscribeBox } from './components/SubscribeBox.jsx';
import { ARCHIVE, PUBLISHED, getLatest, getUpcoming } from './lib/issues.js';
import { issueNo, longDate, parseDay, shortDate } from './lib/text.js';
import './NewsletterPage.css';

const issueHref = (issue, section) => `/newsletter/${issue.slug}${section ? `?section=${section}` : ''}`;

function Masthead({ first, upcoming }) {
  return (
    <header className="nl-masthead" data-hub="nl-masthead">
      <h1 className="nl-masthead__title">
        <Nameplate />
      </h1>
      <div className="nl-masthead__folio">
        <p className="nl-masthead__tagline">The weekly newsletter of the DSBA programme, written by students for students.</p>
        <dl className="nl-masthead__facts">
          {first ? (
            <div className="nl-masthead__fact">
              <dt>Since</dt>
              <dd>{parseDay(first.date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</dd>
            </div>
          ) : null}
          {upcoming ? (
            <div className="nl-masthead__fact">
              <dt>Next issue</dt>
              <dd className="u-tabular">{longDate(upcoming.date).replace(/ \d{4}$/, '')}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </header>
  );
}

function LatestFeature({ issue }) {
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
        <p className="nl-feature__dek">{issue.dek}</p>
        <p className="nl-feature__summary">{issue.summary}</p>
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
        <div className="nl-feature__actions">
          <Button variant="primary" size="lg" to={issueHref(issue)}>
            Read issue {no}
          </Button>
          <span className="nl-feature__time">
            <Clock aria-hidden="true" />
            {issue.readMinutes} min read
          </span>
        </div>
      </div>
    </section>
  );
}

function ShelfItem({ issue }) {
  const upcoming = issue.status === 'upcoming';
  return (
    <li className="nl-shelf__item">
      <Link to={issueHref(issue)} className="nl-shelf__link">
        <IssueCover issue={issue} decorative locked={upcoming} />
        <span className="nl-shelf__no">Issue {issueNo(issue.number)}</span>
        <span className="nl-shelf__title">{issue.title}</span>
        <span className="nl-shelf__meta">
          {upcoming ? (
            <span>Out {longDate(issue.date)}</span>
          ) : (
            <>
              <span className="u-tabular">{shortDate(issue.date)}</span>
              <span className="nl-shelf__time">
                <Clock aria-hidden="true" />
                {issue.readMinutes} min read
              </span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

export default function NewsletterPage() {
  useDocumentTitle('The DSBA Newsletter');
  const latest = getLatest();
  const upcoming = getUpcoming();

  return (
    <Page className="nl-index">
      <Masthead first={PUBLISHED[PUBLISHED.length - 1]} upcoming={upcoming} />

      {latest ? (
        <LatestFeature issue={latest} />
      ) : (
        <Panel padding="none">
          <EmptyState icon={Newspaper} title="The first issue is on its way" body="Subscribe below and The DSBA Newsletter will land in your inbox on Monday." />
        </Panel>
      )}

      <section className="nl-archive" aria-labelledby="nl-archive-title">
        <div className="nl-archive__head">
          <h2 id="nl-archive-title" className="nl-archive__title">
            All issues
          </h2>
          <p className="nl-archive__desc">Every issue so far, newest first, and the one we’re writing now.</p>
        </div>
        <div className="nl-archive__layout">
          <ol role="list" className="nl-shelf">
            {ARCHIVE.map((issue) => (
              <ShelfItem key={issue.slug} issue={issue} />
            ))}
          </ol>
          <SubscribeBox className="nl-archive__subscribe" />
        </div>
      </section>
    </Page>
  );
}
