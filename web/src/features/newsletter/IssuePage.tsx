import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CaretLeft, CaretRight, Clock, Newspaper, PencilSimple, WarningCircle } from '@phosphor-icons/react';
import { isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { useDocumentTitle, useMediaQuery, useQueryParam } from '../../state';
import { Badge, Button, EmptyState, HubLogo, HubMark, Page, Panel, Skeleton, cx } from '../../ui';
import { toCard, useIssue, useIssueDetails, useIssues } from './api';
import { EditorAvatars } from './components/Blocks';
import { DeleteIssueButton, PublishButton } from './components/IssueActions';
import { IssueCover } from './components/IssueCover';
import { IssueSection } from './components/IssueSection';
import { Wordmark } from './components/Nameplate';
import { ShareActions } from './components/ShareActions';
import { SubscribeBox } from './components/SubscribeBox';
import { issueNo, listNames, longDate, sectionDomId } from './lib/text';
import type { Issue, IssueCard } from './types';
import './IssuePage.css';

function RunningHead({ issue, share = true }: { issue: Pick<Issue, 'number' | 'date' | 'slug' | 'title'>; share?: boolean }) {
  return (
    <div className="nl-runhead">
      <Link to="/newsletter" className="nl-runhead__name">
        <Wordmark />
      </Link>
      <p className="nl-runhead__meta">
        <span className="u-tabular">Issue {issueNo(issue.number)}</span>
        <span className="u-tabular">{longDate(issue.date)}</span>
      </p>
      {share ? <ShareActions route={`/newsletter/${issue.slug}`} title={`The DSBA Newsletter ${issueNo(issue.number)}: ${issue.title}`} className="nl-runhead__share" /> : null}
    </div>
  );
}

function Toc({ issue, active, onGo }: { issue: Issue; active: string | undefined; onGo: (id: string) => void }) {
  return (
    <nav className="nl-toc" aria-label="In this issue">
      <p className="nl-toc__title">In this issue</p>
      <ol role="list" className="nl-toc__list">
        {issue.sections.map((s) => {
          const on = active === s.id;
          return (
            <li key={s.id}>
              <button type="button" className={cx('nl-toc__item', on && 'is-active')} aria-current={on ? 'location' : undefined} onClick={() => onGo(s.id)}>
                <span>{s.label}</span>
                {on ? <HubMark size={9} animate="draw" className="nl-toc__mark" /> : null}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="nl-toc__time">
        <Clock aria-hidden="true" />
        {issue.readMinutes} min read
      </p>
    </nav>
  );
}

/** Older and newer published issues, around this one. */
function Pager({ issue }: { issue: Issue }) {
  const list = useIssues();
  const published = (list.data ?? []).filter((i) => i.status === 'published');
  const at = published.findIndex((i) => i.slug === issue.slug);
  const prev = at >= 0 ? published[at + 1] : undefined;
  const next = at > 0 ? published[at - 1] : undefined;
  const details = useIssueDetails([prev, next].filter((i): i is NonNullable<typeof i> => !!i).map((i) => i.slug));
  if (issue.status !== 'published' || (!prev && !next)) return null;
  const detailOf = (slug: string) => details.find((d) => d.data?.slug === slug)?.data;
  const card = (summary: NonNullable<typeof prev>, dir: 'prev' | 'next') => {
    const i: IssueCard = toCard(summary, detailOf(summary.slug));
    return (
      <Link to={`/newsletter/${i.slug}`} className={cx('nl-pager__card', `nl-pager__card--${dir}`)}>
        <span className="nl-pager__cover">
          <IssueCover issue={i} decorative />
        </span>
        <span className="nl-pager__text">
          <span className="nl-pager__dir">
            {dir === 'prev' ? <CaretLeft weight="bold" aria-hidden="true" /> : null}
            {dir === 'prev' ? 'Older issue' : 'Newer issue'}
            {dir === 'next' ? <CaretRight weight="bold" aria-hidden="true" /> : null}
          </span>
          <span className="nl-pager__title">{i.title}</span>
          <span className="nl-pager__meta">
            Issue {issueNo(i.number)}, {longDate(i.date)}
          </span>
        </span>
      </Link>
    );
  };
  return (
    <nav className="nl-pager" aria-label="More issues">
      {prev ? card(prev, 'prev') : <span />}
      {next ? card(next, 'next') : <span />}
    </nav>
  );
}

/** Moderators: what this issue is (draft or published) and what they can do with it. */
function ModeratorBar({ issue }: { issue: Issue }) {
  const navigate = useNavigate();
  const draft = issue.status === 'draft';
  return (
    <div className={cx('nl-modbar', draft && 'is-draft')} data-hub="issue-modbar">
      <p className="nl-modbar__text">
        <Badge tone={draft ? 'highlight' : 'signal'}>{draft ? 'Draft' : 'Published'}</Badge>
        <span>{draft ? 'Only student reps can see this issue until it’s published.' : `Published ${issue.publishedAt ? new Date(issue.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}. Changes show to everyone as soon as you save them.`}</span>
      </p>
      <div className="nl-modbar__actions">
        <Button size="sm" leadingIcon={PencilSimple} to={`/newsletter/${issue.slug}/edit`} data-hub="issue-edit">
          Edit
        </Button>
        <DeleteIssueButton issue={issue} size="sm" onDeleted={() => navigate('/newsletter', { replace: true })} />
        {draft ? <PublishButton issue={issue} size="sm" /> : null}
      </div>
    </div>
  );
}

function IssueReader({ issue }: { issue: Issue }) {
  const no = issueNo(issue.number);
  useDocumentTitle(`${issue.title}, The DSBA Newsletter ${no}`);
  const { isModerator } = useAuth();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [sectionParam, setSectionParam] = useQueryParam('section');
  const [active, setActive] = useState(issue.sections[0]?.id);
  const draft = issue.status === 'draft';

  // Deep link: /newsletter/<slug>?section=<id> scrolls there on arrival (not on later TOC clicks,
  // which update the param themselves). StrictMode-safe: the cleanup cancels, the re-run reschedules.
  const arrivalSection = useRef(sectionParam);
  useEffect(() => {
    const id = arrivalSection.current;
    if (!id) return undefined;
    const el = document.getElementById(sectionDomId(id));
    if (!el) return undefined;
    let alive = true;
    const go = () => {
      if (alive) el.scrollIntoView({ block: 'start' });
    };
    const raf = requestAnimationFrame(() => {
      go();
      setActive(id);
    });
    // Web fonts can swap in after the first scroll and move the section: align again once they're ready.
    void document.fonts?.ready.then(() => requestAnimationFrame(go));
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Active section: the last one whose top has passed 35% of the viewport (or the last, at the bottom).
  useEffect(() => {
    const ids = issue.sections.map((s) => s.id);
    const lastId = ids[ids.length - 1];
    if (!lastId) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.35;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(sectionDomId(id));
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const lastEl = document.getElementById(sectionDomId(lastId));
      if (atEnd && lastEl && lastEl.getBoundingClientRect().top < window.innerHeight) current = lastId;
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [issue]);

  const goTo = (id: string) => {
    const el = document.getElementById(sectionDomId(id));
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('.nl-section__title')?.focus({ preventScroll: true });
    setActive(id);
    setSectionParam(id, { replace: true });
  };

  return (
    <Page className="nl-issue">
      {isModerator ? <ModeratorBar issue={issue} /> : null}
      <header className="nl-issue__head" data-hub="issue-masthead">
        <RunningHead issue={issue} share={!draft} />
        <div className="nl-issue__hero">
          <div className="nl-issue__titles">
            <h1 id="nl-issue-title" className="nl-issue__title">
              {issue.title}
            </h1>
            {issue.dek ? <p className="nl-issue__dek">{issue.dek}</p> : null}
            <div className="nl-issue__byline">
              {issue.editors.length ? (
                <span className="nl-issue__by">
                  <EditorAvatars names={issue.editors} size={32} />
                  <span>By {listNames(issue.editors)}</span>
                </span>
              ) : null}
              <span className="nl-issue__time">
                <Clock aria-hidden="true" />
                {issue.readMinutes} min read
              </span>
            </div>
          </div>
          <div className="nl-issue__cover">
            <IssueCover issue={issue} />
          </div>
        </div>
      </header>

      {issue.sections.length ? (
        <div className="nl-reader">
          <Toc issue={issue} active={active} onGo={goTo} />
          <article className="nl-article" aria-labelledby="nl-issue-title">
            {issue.sections.map((s) => (
              <IssueSection key={s.id} issue={issue} section={s} readOnly={draft} />
            ))}
            <footer className="nl-issue__end">
              <HubLogo variant="tile" size={22} optional decorative className="nl-issue__end-mark" />
              <p>
                That’s the end of issue {no}. Spotted a mistake, or have a story we should tell? <Link to="/forum/new">Tell us in the forum</Link>.
              </p>
              {draft ? null : <ShareActions route={`/newsletter/${issue.slug}`} title={`The DSBA Newsletter ${no}: ${issue.title}`} />}
            </footer>
          </article>
        </div>
      ) : (
        <Panel padding="none" className="nl-issue__empty">
          <EmptyState icon={Newspaper} title="This issue has no stories yet" body={isModerator ? 'Add its sections in the editor.' : 'Come back soon.'} action={isModerator ? <Button to={`/newsletter/${issue.slug}/edit`}>Open the editor</Button> : null} />
        </Panel>
      )}

      <Pager issue={issue} />
      <SubscribeBox variant="band" className="nl-issue__subscribe" />
    </Page>
  );
}

function IssueNotFound() {
  useDocumentTitle('Issue not found');
  return (
    <Page>
      <h1 className="visually-hidden">Issue not found</h1>
      <Panel padding="none">
        <EmptyState
          icon={Newspaper}
          title="We couldn’t find that issue"
          body="The link may be mistyped, or the issue isn’t out yet. Every issue of The DSBA Newsletter is on the newsletter page."
          action={<Button to="/newsletter">See all issues</Button>}
        />
      </Panel>
    </Page>
  );
}

function IssueSkeleton() {
  return (
    <Page className="nl-issue" aria-busy="true">
      <span className="visually-hidden">Loading the issue</span>
      <div className="nl-runhead" aria-hidden="true">
        <Skeleton width={260} height={30} />
      </div>
      <div className="nl-issue__hero" aria-hidden="true">
        <div className="nl-issue__titles">
          <Skeleton width="80%" height={72} />
          <Skeleton width="60%" height={28} style={{ marginTop: 16 }} />
          <Skeleton width="40%" height={18} style={{ marginTop: 24 }} />
        </div>
        <div className="nl-issue__cover">
          <Skeleton height={266} radius={8} />
        </div>
      </div>
      <div className="nl-issue__loading-body" aria-hidden="true">
        <Skeleton lines={6} />
      </div>
    </Page>
  );
}

export default function IssuePage() {
  const { slug } = useParams();
  const q = useIssue(slug);
  const issue = q.data;
  if (q.isPending) return <IssueSkeleton />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) return <IssueNotFound />;
    return (
      <Page>
        <h1 className="visually-hidden">The DSBA Newsletter</h1>
        <Panel padding="none">
          <EmptyState
            icon={WarningCircle}
            title="This issue didn’t load"
            body="Check your connection, then try again."
            action={
              <Button onClick={() => void q.refetch()} loading={q.isFetching}>
                Try again
              </Button>
            }
          />
        </Panel>
      </Page>
    );
  }
  if (!issue) return <IssueNotFound />;
  return <IssueReader key={issue.slug} issue={issue} />;
}
