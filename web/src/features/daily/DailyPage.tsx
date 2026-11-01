// The Daily (/daily), in DSBA Daily's look: a navy band with the day, the set's number and the week's theme, how today
// stands (streak, points, the time to the next set, games done) and a way to sign in; the six games as cards; then
// past days to practise, the leaderboard and your stats.
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { useQueryParam } from '../../state';
import { formatDay } from '../../lib/dates';
import { Page, PageHeader, QueryError, Skeleton, TabPanel, Tabs, glyph, Icon } from '../../ui';
import { newDay, useDailyToday } from './api';
import { ArchiveView } from './components/ArchiveView';
import { Countdown } from './components/Countdown';
import { CountUp } from './components/CountUp';
import { DailyReport } from './components/DailyReport';
import { GameCard } from './components/GameCard';
import { LeaderboardView } from './components/LeaderboardView';
import { StatsView } from './components/StatsView';
import type { DailyToday } from './types';
import './look';
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
  const total = today.games.length || 1;
  const name = me?.displayName?.split(' ')[0];
  return (
    <header className="dd-band">
      <div className="dd-band__intro">
        <p className="dd-band__kicker">
          {name ? <span className="dd-band__hi">Hi {name} · </span> : null}
          {formatDay(today.day, { weekday: 'long', year: false })}
        </p>
        <h1 className="dd-band__title">Today’s puzzles</h1>
        <p className="dd-band__theme">
          <span className="dy-num">Daily #{today.number}</span> · {today.theme.title}
        </p>
      </div>
      <div className="dd-band__side">
        <ul className="dd-stats" aria-label="Today so far">
          <li className="dd-stat">
            <Icon glyph={glyph.flame} active className="dd-stat__icon is-flame" aria-hidden="true" />
            <span className="dd-stat__value dy-num">
              <CountUp value={streak?.current ?? 0} />
            </span>
            <span className="dd-stat__label">
              Day streak
              {streak?.freezeReady && streak.current > 0 ? (
                <span className="dd-stat__freeze" title="Miss a day this week and your streak carries on">
                  <Icon glyph={glyph.snowflake} active aria-hidden="true" />
                  <span className="visually-hidden">Freeze ready</span>
                </span>
              ) : null}
            </span>
          </li>
          <li className="dd-stat">
            <Icon glyph={glyph.star} className="dd-stat__icon is-star" aria-hidden="true" />
            <span className="dd-stat__value dy-num">
              <CountUp value={today.points} />
            </span>
            <span className="dd-stat__label">Points today</span>
          </li>
          <li className="dd-stat">
            <Icon glyph={glyph.clock} className="dd-stat__icon" aria-hidden="true" />
            <span className="dd-stat__value dd-stat__value--time">
              <Countdown to={today.nextAt} onDone={() => newDay(qc)} />
            </span>
            <span className="dd-stat__label">Next puzzles</span>
          </li>
        </ul>
        <div className="dd-progress">
          <span
            className="dd-progress__track"
            role="progressbar"
            aria-label="Today’s games finished"
            aria-valuemin={0}
            aria-valuemax={today.games.length}
            aria-valuenow={today.done}
          >
            <span className="dd-progress__fill" style={{ transform: `scaleX(${today.done / total})` }} />
          </span>
          <span className="dd-progress__text dy-num">
            {today.done} of {today.games.length} done
          </span>
        </div>
        {!me ? (
          <button type="button" className="dd-signin" onClick={() => openSignIn()}>
            <Icon glyph={glyph.signIn} className="dd-signin__icon" aria-hidden="true" />
            <span>
              <b>Sign in</b> to save your scores, keep a streak and join the leaderboard.
            </span>
          </button>
        ) : null}
      </div>
    </header>
  );
}

function TodayView({ today }: { today: DailyToday }) {
  return (
    <>
      {today.games.length > 0 && today.done === today.games.length ? <DailyReport today={today} /> : null}
      <ul className="dh-games" aria-label="Today’s puzzles">
        {today.games.map((g) => (
          <li key={g.info.id}>
            <GameCard game={g} />
          </li>
        ))}
      </ul>
      <p className="dh-foot">New puzzles every day at midnight, Bahrain time. Everyone gets the same ones.</p>
    </>
  );
}

function HubSkeleton() {
  return (
    <div aria-busy="true">
      <span className="visually-hidden">Loading today’s puzzles</span>
      <header className="dd-band">
        <div className="dd-band__intro">
          <h1 className="dd-band__title">Today’s puzzles</h1>
        </div>
      </header>
      <ul className="dh-games">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <Skeleton className="dh-card-skeleton" radius="var(--r-card)" />
          </li>
        ))}
      </ul>
    </div>
  );
}
