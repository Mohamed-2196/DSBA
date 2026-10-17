// The Daily (/daily): today's set of six puzzles under the week's theme, how far you got, your streak and the time
// to the next set; then past days to practise, the leaderboard and your stats.
import { useQueryClient } from '@tanstack/react-query';
import { Flame, Snowflake } from '@phosphor-icons/react';
import { useAuth } from '../../auth';
import { useQueryParam } from '../../state';
import { Button, Page, ProgressRing, QueryError, Skeleton, TabPanel, Tabs, cx } from '../../ui';
import { dailyKeys, useDailyToday } from './api';
import { ArchiveView } from './components/ArchiveView';
import { Countdown } from './components/Countdown';
import { GameCard } from './components/GameCard';
import { LeaderboardView } from './components/LeaderboardView';
import { StatsView } from './components/StatsView';
import { dayLabel } from './lib/days';
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

  return (
    <Page className="dy dh">
      {today.isError ? (
        <>
          <h1 className="dh-title">Daily puzzles</h1>
          <QueryError error={today.error} title="Today’s puzzles didn’t load" onRetry={() => void today.refetch()} retrying={today.isFetching} />
        </>
      ) : today.isPending ? (
        <HubSkeleton />
      ) : (
        <>
          <Head today={today.data} />
          <Tabs idBase="daily" tabs={TABS} value={tab} onChange={(id) => setTab(id, { replace: true })} label="Daily" className="dh-tabs" />
          <TabPanel idBase="daily" id="today" value={tab} className="dh-panel">
            <TodayView today={today.data} />
          </TabPanel>
          <TabPanel idBase="daily" id="past" value={tab} className="dh-panel">
            <ArchiveView today={today.data} />
          </TabPanel>
          <TabPanel idBase="daily" id="board" value={tab} className="dh-panel">
            <LeaderboardView />
          </TabPanel>
          <TabPanel idBase="daily" id="you" value={tab} className="dh-panel">
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
  const total = today.games.length;
  const allDone = today.done >= total;
  const streak = today.streak;
  return (
    <header className="dh-head">
      <div className="dh-head__text">
        <p className="dh-kicker dy-num">
          Daily #{today.number} · {dayLabel(today.day, today.day)}
        </p>
        <h1 className="dh-title">Daily puzzles</h1>
        <p className="dh-theme">
          <span className="dh-theme__name">{today.theme.title}</span>
          <span className="dh-theme__blurb">{today.theme.blurb}</span>
        </p>
      </div>

      <section className="dh-summary" aria-label="Today so far">
        <div className="dh-summary__progress">
          <ProgressRing value={(today.done / Math.max(total, 1)) * 100} size={64} stroke={6} color="var(--signal)" label={`${today.done} of ${total} done`}>
            <span className="dh-summary__ring dy-num">
              {today.done}/{total}
            </span>
          </ProgressRing>
          <div className="dh-summary__lines">
            <p className="dh-summary__big">{allDone ? 'All six done' : today.done ? `${today.done} of ${total} done` : 'Six new puzzles'}</p>
            <p className="dh-summary__small dy-num">{me ? `${today.points} points today` : 'Playing as a guest'}</p>
          </div>
        </div>
        <div className="dh-summary__facts">
          {streak ? (
            <p className={cx('dh-fact', streak.current > 0 && 'is-lit')}>
              <Flame weight={streak.current > 0 ? 'fill' : 'regular'} aria-hidden="true" />
              <span className="dy-num">{streak.current === 1 ? '1-day streak' : `${streak.current}-day streak`}</span>
              {streak.freezeReady && streak.current > 0 ? (
                <span className="dh-fact__freeze" title="Miss a day this week and your streak carries on">
                  <Snowflake weight="fill" aria-hidden="true" />
                  Freeze ready
                </span>
              ) : null}
            </p>
          ) : (
            <p className="dh-fact">
              <Button variant="ghost" size="sm" onClick={() => openSignIn()}>
                Sign in to keep a streak
              </Button>
            </p>
          )}
          <p className="dh-fact">
            <span>New puzzles in</span>
            <strong>
              <Countdown to={today.nextAt} onDone={() => void qc.invalidateQueries({ queryKey: dailyKeys.today() })} />
            </strong>
          </p>
        </div>
      </section>
    </header>
  );
}

function TodayView({ today }: { today: DailyToday }) {
  const allDone = today.done >= today.games.length;
  return (
    <>
      {allDone ? (
        <p className="dh-done dy-rise">That’s all six for today. A new set comes out at midnight.</p>
      ) : null}
      <ul className="dh-games" aria-label="Today’s puzzles">
        {today.games.map((g) => (
          <li key={g.info.id}>
            <GameCard game={g} />
          </li>
        ))}
      </ul>
      <p className="dh-foot">Everyone gets the same puzzles. They change at midnight in Bahrain.</p>
    </>
  );
}

function HubSkeleton() {
  return (
    <div aria-busy="true">
      <span className="visually-hidden">Loading today’s puzzles</span>
      <div className="dh-head">
        <div className="dh-head__text">
          <Skeleton width="12em" />
          <Skeleton width="9em" height={40} />
          <Skeleton width="18em" />
        </div>
        <Skeleton width={320} height={120} radius="var(--r-panel)" />
      </div>
      <ul className="dh-games">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Skeleton height={148} radius="var(--r-panel)" />
          </li>
        ))}
      </ul>
    </div>
  );
}
