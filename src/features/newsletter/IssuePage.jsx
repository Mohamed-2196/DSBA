import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Books,
  CalendarCheck,
  CaretLeft,
  CaretRight,
  ChatsCircle,
  Clock,
  Lightbulb,
  ListBullets,
  LockSimple,
  Megaphone,
  Newspaper,
  NotePencil,
  Sparkle,
  Student,
  UsersThree,
} from '@phosphor-icons/react';
import { Button, EmptyState, ErrorBoundary, Page, Panel, HubMark, cx } from '../../ui';
import { useDocumentTitle, useMediaQuery, useQueryParam } from '../../state';
import { getStudent } from '../../data/people.js';
import { IssueCover } from './components/IssueCover.jsx';
import { Aside, Blocks, EditorAvatars, Profile } from './components/Blocks.jsx';
import { Reactions } from './components/Reactions.jsx';
import { ShareActions } from './components/ShareActions.jsx';
import { SubscribeBox } from './components/SubscribeBox.jsx';
import { CohortCorner } from './components/sections/CohortCorner.jsx';
import { Deadlines, SessionCalendar } from './components/sections/Deadlines.jsx';
import { ForumList, LibraryList } from './components/sections/LiveLists.jsx';
import { ChartOfTheWeek } from './components/sections/ChartOfTheWeek.jsx';
import { getIssue, getLatest, getNeighbours } from './lib/issues.js';
import { getForumThreads, getLibraryFiles, getSessionExams, getSharedNotes } from './lib/live.js';
import { daysBetween, issueNo, longDate } from './lib/text.js';
import './IssuePage.css';

// Not linked from anywhere: reachable only by typing /newsletter/thank-you-tutors. Loaded as its own chunk.
const SPECIAL_SLUG = 'thank-you-tutors';
const SpecialEdition = lazy(() => import('./special/SpecialEdition.jsx'));

const SECTION_ICONS = { NotePencil, ListBullets, CalendarCheck, Sparkle, Megaphone, UsersThree, Lightbulb, Student, ChatsCircle, Books };
const domId = (id) => `nl-sec-${id}`;
const listNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

function RunningHead({ issue, share = true }) {
  return (
    <div className="nl-runhead">
      <Link to="/newsletter" className="nl-runhead__name">
        The DSBA Newsletter
        <HubMark size={11} className="nl-runhead__mark" />
      </Link>
      <p className="nl-runhead__meta">
        <span className="u-tabular">Issue {issueNo(issue.number)}</span>
        <span className="u-tabular">{longDate(issue.date)}</span>
      </p>
      {share ? <ShareActions route={`/newsletter/${issue.slug}`} title={`The DSBA Newsletter ${issueNo(issue.number)}: ${issue.title}`} className="nl-runhead__share" /> : null}
    </div>
  );
}

/** Resolve a section's live content and the title to show (live sections fall back gracefully). */
function useLiveSections(issue) {
  return useMemo(() => {
    const live = {};
    for (const s of issue.sections) {
      if (s.kind === 'deadlines') live[s.id] = { exams: getSessionExams(s) };
      if (s.kind === 'forum') {
        const threads = getForumThreads(4);
        live[s.id] = { threads, title: threads.length ? s.title : s.fallback.title, empty: !threads.length };
      }
      if (s.kind === 'library') {
        const files = getLibraryFiles(4);
        live[s.id] = { files, notes: files.length ? [] : getSharedNotes(6), title: files.length ? s.title : s.fallback.title, empty: !files.length };
      }
    }
    return live;
  }, [issue]);
}

function SectionBody({ issue, section, live }) {
  switch (section.kind) {
    case 'cohorts':
      return <CohortCorner section={section} />;
    case 'deadlines':
      return <Deadlines issue={issue} exams={live?.exams || []} />;
    case 'forum':
      return <ForumList threads={live?.threads || []} fallback={section.fallback} />;
    case 'library':
      return <LibraryList files={live?.files || []} notes={live?.notes || []} fallback={section.fallback} />;
    case 'chart':
      return <ChartOfTheWeek chart={section.chart} />;
    default:
      return null;
  }
}

function IssueSection({ issue, section, live }) {
  const Icon = SECTION_ICONS[section.icon] || Newspaper;
  const headId = `${domId(section.id)}-title`;
  const title = live?.title || section.title;
  // Live sections hide their intro paragraph when they fall back to an invitation.
  const blocks = live?.empty ? [] : section.blocks;
  const exams = live?.exams || [];
  const aside = section.kind === 'deadlines' ? (exams.length ? <SessionCalendar exams={exams} /> : null) : section.aside ? <Aside aside={section.aside} /> : null;
  return (
    <section id={domId(section.id)} className={cx('nl-section', `nl-section--${section.kind || 'copy'}`)} aria-labelledby={headId} data-hub="issue-section">
      <header className="nl-section__head">
        <p className="nl-section__label">
          <Icon weight="duotone" aria-hidden="true" />
          {section.label}
        </p>
        <h2 id={headId} className="nl-section__title" tabIndex={-1}>
          {title}
        </h2>
        {section.profile ? <Profile profile={section.profile} /> : null}
      </header>
      <div className="nl-section__body">
        <Blocks blocks={blocks} editors={issue.editors} />
        <ErrorBoundary name={`Newsletter ${section.id}`} resetKey={issue.slug}>
          <SectionBody issue={issue} section={section} live={live} />
        </ErrorBoundary>
        <Blocks blocks={section.after} editors={issue.editors} />
        <Reactions issueSlug={issue.slug} sectionId={section.id} seed={section.reactions} label={section.label} />
      </div>
      {aside ? <div className="nl-section__aside">{aside}</div> : null}
    </section>
  );
}

function Toc({ issue, active, onGo }) {
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

function Pager({ issue }) {
  const { prev, next } = getNeighbours(issue);
  if (!prev && !next) return null;
  const card = (i, dir) => {
    const upcoming = i.status !== 'published';
    return (
      <Link to={`/newsletter/${i.slug}`} className={cx('nl-pager__card', `nl-pager__card--${dir}`)}>
        <span className="nl-pager__cover">
          <IssueCover issue={i} decorative />
        </span>
        <span className="nl-pager__text">
          <span className="nl-pager__dir">
            {dir === 'prev' ? <CaretLeft weight="bold" aria-hidden="true" /> : null}
            {dir === 'prev' ? 'Previous issue' : 'Next issue'}
            {dir === 'next' ? <CaretRight weight="bold" aria-hidden="true" /> : null}
          </span>
          <span className="nl-pager__title">{i.title}</span>
          <span className="nl-pager__meta">
            {upcoming ? <LockSimple weight="bold" aria-hidden="true" /> : null}
            Issue {issueNo(i.number)}, {upcoming ? `out ${longDate(i.date)}` : longDate(i.date)}
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

function IssueReader({ issue }) {
  const no = issueNo(issue.number);
  useDocumentTitle(`${issue.title}, The DSBA Newsletter ${no}`);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [sectionParam, setSectionParam] = useQueryParam('section', null);
  const [active, setActive] = useState(issue.sections[0]?.id);
  const live = useLiveSections(issue);
  const editors = issue.editors.map(getStudent).filter(Boolean).map((p) => p.name);

  // Deep link: /newsletter/<slug>?section=<id> scrolls there on arrival (not on later TOC clicks,
  // which update the param themselves). StrictMode-safe: the cleanup cancels, the re-run reschedules.
  const arrivalSection = useRef(sectionParam);
  useEffect(() => {
    const id = arrivalSection.current;
    if (!id) return undefined;
    const el = document.getElementById(domId(id));
    if (!el) return undefined;
    let live = true;
    const go = () => live && el.scrollIntoView({ block: 'start' });
    const raf = requestAnimationFrame(() => {
      go();
      setActive(id);
    });
    // Web fonts can swap in after the first scroll and move the section: align again once they're ready.
    document.fonts?.ready.then(() => requestAnimationFrame(go));
    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Active section: the last one whose top has passed 35% of the viewport (or the last, at the bottom).
  useEffect(() => {
    const ids = issue.sections.map((s) => s.id);
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.35;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(domId(id));
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const lastEl = document.getElementById(domId(ids[ids.length - 1]));
      if (atEnd && lastEl && lastEl.getBoundingClientRect().top < window.innerHeight) current = ids[ids.length - 1];
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

  const goTo = (id) => {
    const el = document.getElementById(domId(id));
    if (!el) return;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.querySelector('.nl-section__title')?.focus({ preventScroll: true });
    setActive(id);
    setSectionParam(id, { replace: true });
  };

  return (
    <Page className="nl-issue">
      <header className="nl-issue__head" data-hub="issue-masthead">
        <RunningHead issue={issue} />
        <div className="nl-issue__hero">
          <div className="nl-issue__titles">
            <h1 id="nl-issue-title" className="nl-issue__title">
              {issue.title}
            </h1>
            <p className="nl-issue__dek">{issue.dek}</p>
            <div className="nl-issue__byline">
              <span className="nl-issue__by">
                <EditorAvatars ids={issue.editors} size={32} />
                <span>By {listNames(editors)}</span>
              </span>
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

      <div className="nl-reader">
        <Toc issue={issue} active={active} onGo={goTo} />
        <article className="nl-article" aria-labelledby="nl-issue-title">
          {issue.sections.map((s) => (
            <IssueSection key={s.id} issue={issue} section={s} live={live[s.id]} />
          ))}
          <footer className="nl-issue__end">
            <HubMark size={14} className="nl-issue__end-mark" />
            <p>
              End of issue {no}. Found a mistake or have a story for the next one?{' '}
              <Link to="/forum/new">Tell us in the forum</Link>.
            </p>
            <ShareActions route={`/newsletter/${issue.slug}`} title={`The DSBA Newsletter ${no}: ${issue.title}`} />
          </footer>
        </article>
      </div>

      <Pager issue={issue} />
      <SubscribeBox variant="band" className="nl-issue__subscribe" />
    </Page>
  );
}

function LockedIssue({ issue }) {
  const no = issueNo(issue.number);
  useDocumentTitle(`${issue.title}, The DSBA Newsletter ${no}`);
  const latest = getLatest();
  const days = daysBetween(new Date(Date.now()), issue.date);
  const when = days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : days === 0 ? 'today' : null;
  return (
    <Page className="nl-issue nl-issue--locked">
      <header className="nl-issue__head" data-hub="issue-masthead">
        <RunningHead issue={issue} share={false} />
      </header>
      <div className="nl-locked">
        <div className="nl-locked__cover">
          <IssueCover issue={issue} locked />
        </div>
        <div className="nl-locked__body">
          <p className="nl-locked__status">
            <LockSimple weight="bold" aria-hidden="true" />
            Coming {longDate(issue.date)}
            {when ? `, ${when}` : ''}
          </p>
          <h1 className="nl-issue__title">{issue.title}</h1>
          <p className="nl-issue__dek">{issue.dek}</p>
          <h2 className="nl-locked__subtitle">What we’re writing</h2>
          <ul className="nl-list nl-locked__plan">
            {issue.planned.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {latest ? (
            <p className="nl-cta">
              <Button to={`/newsletter/${latest.slug}`} leadingIcon={Newspaper}>
                Read issue {issueNo(latest.number)} while you wait
              </Button>
            </p>
          ) : null}
        </div>
      </div>
      <SubscribeBox
        variant="band"
        className="nl-issue__subscribe"
        title={`Get issue ${no} in your inbox`}
        body={`Subscribe and it lands in your inbox on ${longDate(issue.date)}, the day it’s out, with every issue after it.`}
      />
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
          body="The link may be mistyped. Every issue of The DSBA Newsletter is on the newsletter page."
          action={<Button to="/newsletter">See all issues</Button>}
        />
      </Panel>
    </Page>
  );
}

export default function IssuePage() {
  const { slug } = useParams();
  if (slug === SPECIAL_SLUG) {
    return (
      <Suspense fallback={<div className="nl-loading" aria-busy="true"><HubMark size={22} animate="loop" title="Loading" /></div>}>
        <SpecialEdition />
      </Suspense>
    );
  }
  const issue = getIssue(slug);
  if (!issue) return <IssueNotFound />;
  if (issue.status !== 'published') return <LockedIssue key={issue.slug} issue={issue} />;
  return <IssueReader key={issue.slug} issue={issue} />;
}
