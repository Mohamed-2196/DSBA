// Home: the front door. Greeting, the exam timeline (the page's one dominant element and its one
// orchestrated motion moment), then an editorial body: a main column (learning, forum, library)
// and an aside (your modules, coming up, The DSBA Newsletter). Widgets from other features come from their
// public.ts and each sits in its own ErrorBoundary; each has its own loading, empty and error states.
import { useEffect, useMemo, useState } from 'react';
import { SignIn } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { COHORTS, YEARS, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, CohortBadge, ErrorBoundary, Menu, Page, PageSection, ProgrammeLockup, SectionHeader } from '../../ui';
import { UpcomingEvents, useCalendarEvents } from '../calendar/public';
import { HotThreads } from '../forum/public';
import { ContinueLearning } from '../modules/public';
import { LatestIssueCard } from '../newsletter/public';
import { ExamTimeline } from './ExamTimeline';
import { NewInLibrary } from './NewInLibrary';
import { getExamSession } from './session';
import { addDays, dayKey, formatLongDay, parseDay, todayKey } from '../../lib/dates';
import { greetingFor } from './time';
import { YourModules } from './YourModules';
import './HomePage.css';

// The load choreography plays once per page load (not on every visit back to Home).
let introPlayed = false;

const onboardingIsOpen = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.onboarding === 'open';

/** true while the onboarding dialog is up (it announces itself on <html data-onboarding>). */
function useOnboardingOpen(): boolean {
  const [open, setOpen] = useState(onboardingIsOpen);
  useEffect(() => {
    const on = () => setOpen(onboardingIsOpen());
    on();
    window.addEventListener('hub:onboarding', on);
    return () => window.removeEventListener('hub:onboarding', on);
  }, []);
  return open;
}

/** "Mohamed" from "Mohamed Alnooh". */
const firstNameOf = (name: string | null | undefined): string | null => name?.trim().split(/\s+/)[0] || null;

export default function HomePage() {
  const { year, setYear, activeYear } = useYear();
  const { me, status, openSignIn } = useAuth();
  const { getModule } = useModules();
  const onboarding = useOnboardingOpen();
  const [intro, setIntro] = useState(() => !introPlayed);
  const now = new Date();
  // Today in Bahrain, as the API counts it; a new object only when the day changes.
  const todayIs = todayKey(now);
  const today = useMemo(() => parseDay(todayIs), [todayIs]);
  const calendar = useCalendarEvents({ from: todayIs, to: dayKey(addDays(today, 120)) });
  const loading = calendar.isPending;
  const playing = intro && !onboarding && !loading;

  useEffect(() => {
    if (!playing) return undefined;
    introPlayed = true;
    // After the choreography, drop the intro classes so later changes (year switch) don't replay it.
    const t = setTimeout(() => setIntro(false), 4200);
    return () => clearTimeout(t);
  }, [playing]);

  const session = useMemo(() => getExamSession(calendar.data ?? [], activeYear, getModule, today), [calendar.data, activeYear, getModule, today]);
  const name = status === 'signed-in' ? firstNameOf(me?.displayName) : null;

  return (
    <Page className="home">
      <header className="home-greeting" data-hub="home-greeting">
        <p className="home-greeting__meta">
          <time dateTime={todayIs}>{formatLongDay(today)}</time>
          {year ? (
            <CohortBadge year={year} />
          ) : (
            // No year chosen yet: Year 1 is what the page shows, not the person's own year.
            <>
              <span className="home-greeting__showing">
                Showing <CohortBadge year={activeYear} />
              </span>
              <Menu
                align="start"
                label="Pick your year"
                items={YEARS.map((y) => ({ id: `y${y}`, label: COHORTS[y].label, icon: <span className={`yr-dot yr-dot--y${y}`} />, onSelect: () => setYear(y) }))}
                trigger={
                  <Button size="sm" variant="ghost" data-hub="home-pick-year">
                    Pick your year
                  </Button>
                }
              />
            </>
          )}
        </p>
        <h1 className="home-greeting__title">
          {greetingFor(now)}
          {name ? `, ${name}` : ''}
        </h1>
        {status === 'guest' ? (
          <p className="home-greeting__guest" data-hub="home-signin">
            <span>Sign in to keep your lesson progress on every device and to post in the forum.</span>
            <Button size="sm" variant="ghost" leadingIcon={SignIn} onClick={() => openSignIn()}>
              Sign in
            </Button>
          </p>
        ) : null}
        <ProgrammeLockup className="home-greeting__affil" />
      </header>

      <ErrorBoundary name="ExamTimeline">
        <ExamTimeline
          session={session}
          year={activeYear}
          intro={playing}
          today={today}
          loading={loading}
          error={calendar.isError ? calendar.error : undefined}
          onRetry={() => void calendar.refetch()}
          retrying={calendar.isFetching}
        />
      </ErrorBoundary>

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
              <SectionHeader
                id="home-threads"
                title="Hot in the forum"
                action={
                  <Button variant="ghost" size="sm" to="/forum">
                    Open the forum
                  </Button>
                }
              />
              <ErrorBoundary name="HotThreads">
                <HotThreads n={4} year={activeYear} />
              </ErrorBoundary>
            </PageSection>
            <PageSection className="home-sec home-sec--library" aria-labelledby="home-library">
              <SectionHeader
                id="home-library"
                title="New in the library"
                action={
                  <Button variant="ghost" size="sm" to="/library">
                    Open the library
                  </Button>
                }
              />
              <ErrorBoundary name="NewInLibrary">
                <NewInLibrary year={activeYear} n={5} />
              </ErrorBoundary>
            </PageSection>
          </div>
          <div className="home-aside">
            <PageSection className="home-sec home-sec--modules" aria-labelledby="home-modules">
              <SectionHeader
                id="home-modules"
                title="Your modules"
                action={
                  <Button variant="ghost" size="sm" to="/modules">
                    All modules
                  </Button>
                }
              />
              <ErrorBoundary name="YourModules">
                <YourModules year={activeYear} today={today} />
              </ErrorBoundary>
            </PageSection>
            <PageSection className="home-sec home-sec--upcoming" aria-labelledby="home-upcoming">
              <SectionHeader
                id="home-upcoming"
                title="Coming up"
                action={
                  <Button variant="ghost" size="sm" to="/calendar">
                    Open calendar
                  </Button>
                }
              />
              <ErrorBoundary name="UpcomingEvents">
                <UpcomingEvents n={4} year={activeYear} />
              </ErrorBoundary>
            </PageSection>
            <PageSection className="home-sec home-sec--exams" aria-labelledby="home-news">
              <SectionHeader
                id="home-news"
                title="The DSBA Newsletter"
                action={
                  <Button variant="ghost" size="sm" to="/newsletter">
                    All issues
                  </Button>
                }
              />
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
