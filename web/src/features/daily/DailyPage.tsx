// The Daily (/daily): the day's number and the week's theme, one line of how today stands (done, points, streak, the
// time to the next set), and the six games as tiles; then past days to practise, the leaderboard and your stats.
import { useQueryClient } from '@tanstack/react-query';
import { Flame, Snowflake } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { useQueryParam } from '../../state';
import { Button, cx, Page, PageHeader, QueryError, Skeleton, TabPanel, Tabs } from '../../ui';
import { newDay, useDailyToday } from './api';
import { ArchiveView } from './components/ArchiveView';
import { Countdown } from './components/Countdown';
import { GameCard } from './components/GameCard';
import { LeaderboardView } from './components/LeaderboardView';
import { StatsView } from './components/StatsView';
import type { DailyToday } from './types';
import './daily.css';
import './DailyPage.css';

type Tab = 'today' | 'past' | 'board' | 'you';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'past', label: 'Past days' },
  { id: 'board', label: 'Leaderboard' },
  { id: 'you', label: 'Your stats' },
];

export default function DailyPage() {
  const today = useDailyToday();
  const [tabParam, setTab] = useQueryParam('tab', 'today');
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'today';

  // What has loaded stays on screen when a later refresh fails.
  return (
    <Page className="dy dh">
      {today.data === undefined ? (
        today.isError ? (
          <>
            <PageHeader section="tools" title="Daily puzzles" />
            <QueryError
              error={today.error}
              title="Today’s puzzles didn’t load"
              onRetry={() => void today.refetch()}
              retrying={today.isFetching}
            />
          </>
        ) : (
          <HubSkeleton />
        )
      ) : (
        <>
          <Head today={today.data} />
          <Tabs
            idBase="daily"
            tabs={TABS}
            value={tab}
            onChange={(id) => setTab(id, { replace: true })}
            label="Daily"
            className="dh-tabs"
          />
          <TabPanel idBase="daily" id="today" value={tab}>
            <TodayView today={today.data} />
          </TabPanel>
          <TabPanel idBase="daily" id="past" value={tab}>
            <ArchiveView today={today.data} />
          </TabPanel>
          <TabPanel idBase="daily" id="board" value={tab}>
            <LeaderboardView />
          </TabPanel>
          <TabPanel idBase="daily" id="you" value={tab}>
            <StatsView />
          </TabPanel>
        </>
      )}
    </Page>
  );
}

function Head({ today }: { today: DailyToday }) {
  const { me, openSignIn } = useAuth();
  const qc = useQueryClient();
  const streak = today.streak;
  return (
    <PageHeader
      section="tools"
      className="dh-head"
      title={<span className="dy-num">{`Daily #${today.number} · ${today.theme.title}`}</span>}
      description={today.theme.blurb || undefined}
      meta={
        // One line of how today stands. Only the streak carries an icon: the flame and the freeze are the game's own.
        <ul className="dh-status" aria-label="Today so far">
          <li className="dy-num">
            {today.done} of {today.games.length} done
          </li>
          {me ? <li className="dy-num">{today.points === 1 ? '1 point' : `${today.points} points`}</li> : null}
          {streak ? (
            <li className={cx('dy-num', streak.current > 0 && 'is-lit')}>
              {streak.current > 0 ? <Flame weight="fill" aria-hidden="true" /> : null}
              {streak.current > 0 ? `${streak.current}-day streak` : 'Start a streak'}
              {streak.freezeReady && streak.current > 0 ? (
                <span className="dh-status__freeze" title="Miss a day this week and your streak carries on">
                  <Snowflake weight="fill" aria-hidden="true" />
                  <span className="dh-status__freeze-text">Freeze ready</span>
                </span>
              ) : null}
            </li>
          ) : (
            <li>
              <Button variant="secondary" size="sm" onClick={() => openSignIn()}>
                Sign in to keep points and a streak
              </Button>
            </li>
          )}
          <li>
            Next set in <Countdown to={today.nextAt} onDone={() => newDay(qc)} />
          </li>
        </ul>
      }
    />
  );
}

function TodayView({ today }: { today: DailyToday }) {
  return (
    <ul className="dh-games" aria-label="Today’s puzzles">
      {today.games.map((g) => (
        <li key={g.info.id}>
          <GameCard game={g} />
        </li>
      ))}
    </ul>
  );
}

function HubSkeleton() {
  return (
    <div aria-busy="true">
      <span className="visually-hidden">Loading today’s puzzles</span>
      <PageHeader section="tools" className="dh-head" title="Daily puzzles" meta={<Skeleton width="16em" />} />
      <ul className="dh-games">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Skeleton className="dh-tile-skeleton" radius="var(--r-card)" />
          </li>
        ))}
      </ul>
    </div>
  );
}
