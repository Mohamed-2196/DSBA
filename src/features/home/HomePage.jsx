// Home: the front door. Greeting, the exam pulse (the page's one dominant element and its one
// orchestrated motion moment), then an editorial body: a main column (learning, forum, library)
// and an aside (your modules, coming up, The Pulse). Widgets from other features come from their
// public.js and each sits in its own ErrorBoundary.
import { useEffect, useMemo, useState } from 'react';
import { useYear } from '../../state';
import { CURRENT_USER } from '../../data/people.js';
import { Button, CohortBadge, ErrorBoundary, Page, PageSection, ProgrammeLockup, SectionHeader } from '../../ui';
import { ContinueLearning } from '../modules/public.js';
import { UpcomingEvents } from '../calendar/public.js';
import { HotThreads } from '../forum/public.js';
import { LatestIssueCard } from '../newsletter/public.js';
import { ExamPulse } from './ExamPulse.jsx';
import { YourModules } from './YourModules.jsx';
import { NewInLibrary } from './NewInLibrary.jsx';
import { getExamSession } from './session.js';
import { greetingFor, isoDay, longDay, startOfDay } from './time.js';
import './HomePage.css';

// The load choreography plays once per page load (not on every visit back to Home).
let introPlayed = false;

/** true while the onboarding dialog is up (it announces itself on <html data-onboarding>). */
function useOnboardingOpen() {
  const read = () => typeof document !== 'undefined' && document.documentElement.dataset.onboarding === 'open';
  const [open, setOpen] = useState(read);
  useEffect(() => {
    const on = () => setOpen(read());
    on();
    window.addEventListener('pulse:onboarding', on);
    return () => window.removeEventListener('pulse:onboarding', on);
  }, []);
  return open;
}

export default function HomePage() {
  const { activeYear } = useYear();
  const onboarding = useOnboardingOpen();
  const [intro, setIntro] = useState(() => !introPlayed);
  const playing = intro && !onboarding;

  useEffect(() => {
    if (!playing) return undefined;
    introPlayed = true;
    // After the choreography, drop the intro classes so later changes (year switch) don't replay it.
    const t = setTimeout(() => setIntro(false), 4200);
    return () => clearTimeout(t);
  }, [playing]);

  const now = new Date();
  const dayKey = startOfDay(now).getTime();
  const today = useMemo(() => new Date(dayKey), [dayKey]);
  const session = useMemo(() => getExamSession(activeYear, today), [activeYear, today]);
  const firstName = CURRENT_USER.name.split(' ')[0];

  return (
    <Page className="home">
      <header className="home-greeting" data-pulse="home-greeting">
        <p className="home-greeting__meta">
          <time dateTime={isoDay(today)}>{longDay(now)}</time>
          <CohortBadge year={activeYear} />
        </p>
        <h1 className="home-greeting__title">
          {greetingFor(now)}, {firstName}
        </h1>
        <ProgrammeLockup className="home-greeting__affil" />
      </header>

      <ExamPulse session={session} year={activeYear} intro={intro && !onboarding} today={today} />

      <div className="home-body">
        <div className="home-grid">
          <div className="home-main">
            <PageSection className="home-sec home-sec--continue" aria-labelledby="home-continue">
              <SectionHeader id="home-continue" title="Continue learning" />
              <ErrorBoundary name="ContinueLearning">
                <ContinueLearning />
              </ErrorBoundary>
            </PageSection>
            <PageSection className="home-sec home-sec--threads" aria-labelledby="home-threads">
              <SectionHeader id="home-threads" title="Hot in the forum" action={<Button variant="ghost" size="sm" to="/forum">Open the forum</Button>} />
              <ErrorBoundary name="HotThreads">
                <HotThreads n={4} />
              </ErrorBoundary>
            </PageSection>
            <PageSection className="home-sec home-sec--library" aria-labelledby="home-library">
              <SectionHeader id="home-library" title="New in the library" action={<Button variant="ghost" size="sm" to="/library">Open the library</Button>} />
              <ErrorBoundary name="NewInLibrary">
                <NewInLibrary year={activeYear} n={5} />
              </ErrorBoundary>
            </PageSection>
          </div>
          <div className="home-aside">
            <PageSection className="home-sec home-sec--modules" aria-labelledby="home-modules">
              <SectionHeader id="home-modules" title="Your modules" action={<Button variant="ghost" size="sm" to="/modules">All modules</Button>} />
              <YourModules year={activeYear} today={today} />
            </PageSection>
            <PageSection className="home-sec home-sec--upcoming" aria-labelledby="home-upcoming">
              <SectionHeader id="home-upcoming" title="Coming up" action={<Button variant="ghost" size="sm" to="/calendar">Open calendar</Button>} />
              <ErrorBoundary name="UpcomingEvents">
                <UpcomingEvents n={4} />
              </ErrorBoundary>
            </PageSection>
            <PageSection className="home-sec home-sec--pulse" aria-labelledby="home-pulse">
              <SectionHeader id="home-pulse" title="The Pulse" action={<Button variant="ghost" size="sm" to="/newsletter">All issues</Button>} />
              <ErrorBoundary name="LatestIssueCard">
                <LatestIssueCard />
              </ErrorBoundary>
            </PageSection>
          </div>
        </div>
      </div>
    </Page>
  );
}
