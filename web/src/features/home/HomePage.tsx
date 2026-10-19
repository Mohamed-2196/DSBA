// Home: a greeting, then a grid of equal cards the student can show, hide and reorder (Customise Home): Up next,
// To-do, Continue, My modules, New files and Forum, with notices and the Ask Noora prompt across the whole width.
// Blocks from other features come from their public.ts, each in its own ErrorBoundary with its own loading, empty and
// error states; a notice with nothing to say renders nothing.
import { useMemo, useState, type ReactNode } from 'react';
import { SignIn, SlidersHorizontal, SquaresFour } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { COHORTS, YEARS, useYear } from '../../state';
import { useModules } from '../../state/modules';
import {
  Button,
  CohortBadge,
  EmptyState,
  ErrorBoundary,
  Menu,
  Page,
  PageSection,
  Panel,
  QueryError,
  SectionHeader,
  Skeleton,
  cx,
} from '../../ui';
import { BoardTodo, useTodayAgenda } from '../board/public';
import { useMyCalendarEvents } from '../calendar/public';
import { HelpBelow } from '../forum/public';
import { DailyQuestion } from '../library/public';
import { ContinueLearning, useTracking } from '../modules/public';
import { LatestIssueCard } from '../newsletter/public';
import { usePapers } from '../papers/public';
import { ResultsDayCard, StartHereCard } from '../start/public';
import { DailyCard } from '../daily/public';
import { addDays, dayKey, formatLongDay, parseDay, todayKey } from '../../lib/dates';
import { AskNoora } from './AskNoora';
import { ALL_BLOCKS, BLOCKS, offeredBlocks, type HomeBlock } from './blocks';
import { ComingUp } from './ComingUp';
import { CustomizeHome } from './CustomizeHome';
import { useHomeLayout } from './layout';
import { HomeForum } from './HomeForum';
import { NewFiles } from './NewFiles';
import { getExamSession } from './session';
import { greetingFor } from './time';
import { YourModules } from './YourModules';
import './HomePage.css';

/** "Mohamed" from "Mohamed Alnooh". */
const firstNameOf = (name: string | null | undefined): string | null => name?.trim().split(/\s+/)[0] || null;

/** A card with a heading and an optional action. */
function Block({ id, action, children }: { id: HomeBlock; action?: ReactNode; children: ReactNode }) {
  const titleId = `home-${id}`;
  return (
    <PageSection
      className={cx('home-block', `home-block--${BLOCKS[id].span}`, `home-block--${id}`)}
      aria-labelledby={titleId}
      data-block={id}
    >
      <SectionHeader id={titleId} title={BLOCKS[id].title} action={action} />
      <ErrorBoundary name={`Home ${id}`}>{children}</ErrorBoundary>
    </PageSection>
  );
}

/** A block that brings its own card, across the whole width, and renders nothing when it has nothing to say. */
function Notice({ id, children }: { id: HomeBlock; children: ReactNode }) {
  return (
    <div className={cx('home-block', 'home-block--wide', 'home-block--notice', `home-block--${id}`)} data-block={id}>
      <ErrorBoundary name={`Home ${id}`} fallback={null}>
        {children}
      </ErrorBoundary>
    </div>
  );
}

export default function HomePage() {
  const { year, setYear, activeYear } = useYear();
  const { me, status, openSignIn, featureOn } = useAuth();
  const tracking = useTracking();
  const { getModule } = useModules();
  const { papers } = usePapers();
  const [customizing, setCustomizing] = useState(false);
  const signedIn = status === 'signed-in';
  const calendarOn = featureOn('calendar');
  const forumOn = featureOn('forum');

  const now = new Date();
  // Today in Bahrain, as the API counts it; a new object only when the day changes.
  const todayIs = todayKey(now);
  const today = useMemo(() => parseDay(todayIs), [todayIs]);
  const calendar = useMyCalendarEvents({ from: todayIs, to: dayKey(addDays(today, 120)) }, { enabled: calendarOn });
  const session = useMemo(
    () => getExamSession(calendar.data ?? [], activeYear, getModule, today, { papers }),
    [calendar.data, activeYear, getModule, today, papers],
  );
  const nextExam = session?.kind === 'exams' && session.next.type === 'exam' ? session.next : null;
  const todo = useTodayAgenda({ enabled: signedIn && featureOn('board') });

  // The blocks this person can have: every feature each needs is on, and an account or lesson progress if it needs one.
  const offeredKey = offeredBlocks(featureOn, { signedIn, tracking: tracking.on }).join();
  const available = useMemo(() => new Set(ALL_BLOCKS.filter((b) => offeredKey.split(',').includes(b))), [offeredKey]);
  const layout = useHomeLayout(available);

  const render = (b: HomeBlock): ReactNode => {
    switch (b) {
      case 'start_here':
        return (
          <Notice key={b} id={b}>
            <StartHereCard year={activeYear} />
          </Notice>
        );
      case 'results_day':
        return (
          <Notice key={b} id={b}>
            <ResultsDayCard />
          </Notice>
        );
      case 'daily_question':
        return nextExam?.module ? (
          <Notice key={b} id={b}>
            <DailyQuestion
              moduleId={nextExam.module.id}
              moduleName={nextExam.module.name}
              examDays={nextExam.days}
              day={todayIs}
            />
          </Notice>
        ) : null;
      case 'help_below':
        return (
          <Notice key={b} id={b}>
            <HelpBelow />
          </Notice>
        );
      case 'coming_up':
        return (
          <Block
            key={b}
            id={b}
            action={
              <Button variant="ghost" size="sm" to="/calendar">
                Open calendar
              </Button>
            }
          >
            <ComingUp
              session={session}
              year={activeYear}
              loading={calendar.isPending}
              error={calendar.isError ? calendar.error : null}
              onRetry={() => void calendar.refetch()}
              retrying={calendar.isFetching}
            />
          </Block>
        );
      case 'todo':
        // Only while something dated is due (or the list didn't load, to say so): undated cards stay on the boards.
        return todo.isError || todo.data?.cards.length ? (
          <Block
            key={b}
            id={b}
            action={
              <Button variant="ghost" size="sm" to="/board">
                Open my boards
              </Button>
            }
          >
            <BoardTodo n={4} />
          </Block>
        ) : null;
      case 'continue':
        return (
          <Block key={b} id={b}>
            <ContinueLearning />
          </Block>
        );
      case 'modules':
        return (
          <Block
            key={b}
            id={b}
            action={
              <Button variant="ghost" size="sm" to="/modules">
                All modules
              </Button>
            }
          >
            <YourModules year={activeYear} today={today} mine={year !== null} />
          </Block>
        );
      case 'files':
        return (
          <Block
            key={b}
            id={b}
            action={
              <Button variant="ghost" size="sm" to="/library">
                Open the library
              </Button>
            }
          >
            <NewFiles year={activeYear} />
          </Block>
        );
      case 'forum':
        return (
          <Block
            key={b}
            id={b}
            action={
              <Button variant="ghost" size="sm" to="/forum">
                Open the forum
              </Button>
            }
          >
            <HomeForum year={activeYear} />
          </Block>
        );
      case 'noora':
        return (
          <Notice key={b} id={b}>
            <AskNoora />
          </Notice>
        );
      case 'newsletter':
        return (
          <Block
            key={b}
            id={b}
            action={
              <Button variant="ghost" size="sm" to="/newsletter">
                All issues
              </Button>
            }
          >
            <LatestIssueCard />
          </Block>
        );
      case 'daily':
        return (
          <Block
            key={b}
            id={b}
            action={
              <Button variant="ghost" size="sm" to="/daily">
                Open Daily
              </Button>
            }
          >
            <DailyCard />
          </Block>
        );
    }
  };

  const name = signedIn ? firstNameOf(me?.displayName) : null;
  const blocks = layout.shown.map(render).filter(Boolean);

  return (
    <Page className="home">
      <header className="home-head" data-hub="home-greeting">
        <div className="home-head__text">
          <p className="home-head__meta">
            <time dateTime={todayIs}>{formatLongDay(today)}</time>
            {year ? (
              <CohortBadge year={year} />
            ) : (
              // No year chosen yet: Year 1 is what the page shows, not the person's own year.
              <>
                <span className="home-head__showing">
                  Showing <CohortBadge year={activeYear} />
                </span>
                <Menu
                  align="start"
                  label="Pick your year"
                  items={YEARS.map((y) => ({
                    id: `y${y}`,
                    label: COHORTS[y].label,
                    icon: <span className={`yr-dot yr-dot--y${y}`} />,
                    onSelect: () => setYear(y),
                  }))}
                  trigger={
                    <Button size="sm" variant="ghost" data-hub="home-pick-year">
                      Pick your year
                    </Button>
                  }
                />
              </>
            )}
          </p>
          <h1 className="home-head__title">
            {greetingFor(now)}
            {name ? `, ${name}` : ''}
          </h1>
          {status === 'guest' ? (
            <p className="home-head__guest" data-hub="home-signin">
              <span>
                {forumOn
                  ? 'Sign in for a study board, your Home on every device, and the forum.'
                  : 'Sign in for a study board and your Home on every device.'}
              </span>
              <Button size="sm" variant="ghost" leadingIcon={SignIn} onClick={() => openSignIn()}>
                Sign in
              </Button>
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          leadingIcon={SlidersHorizontal}
          onClick={() => setCustomizing(true)}
          className="home-head__custom"
          data-hub="home-customize-open"
        >
          Customise Home
        </Button>
      </header>

      {layout.problem ? (
        <QueryError
          error={layout.problem.error}
          title="Your Home didn’t load"
          onRetry={layout.problem.retry}
          retrying={layout.problem.retrying}
        />
      ) : layout.waiting ? (
        <div className="home-blocks" aria-busy="true">
          <span className="visually-hidden">Loading your Home</span>
          <div className="home-blocks__grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={220} radius={16} />
            ))}
          </div>
        </div>
      ) : blocks.length ? (
        <div className="home-blocks">
          <div className="home-blocks__grid">{blocks}</div>
        </div>
      ) : (
        <Panel padding="none">
          <EmptyState
            icon={SquaresFour}
            title="Your Home is empty"
            body="Choose what to show here: your next exam, your to-do, your modules and more."
            action={
              <Button variant="primary" onClick={() => setCustomizing(true)}>
                Customise Home
              </Button>
            }
          />
        </Panel>
      )}

      <CustomizeHome open={customizing} onClose={() => setCustomizing(false)} layout={layout} tracking={tracking} />
    </Page>
  );
}
