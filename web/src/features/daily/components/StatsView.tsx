// Your stats: what you've played, your streak and its weekly freeze, and the badges, earned and still to earn.
import {
  CalendarCheck,
  Crown,
  Flame,
  GridNine,
  Lightning,
  Lock,
  Medal,
  Snowflake,
  Sparkle,
  SquaresFour,
  Star,
  Trophy,
  type Icon,
} from '@phosphor-icons/react';
import { useAuth } from '../../../auth';
import { Button, Panel, QueryError, Skeleton, cx } from '../../../ui';
import { useDailyMe } from '../api';

const BADGE_ICONS: Record<string, Icon> = {
  first: Star,
  'full-set': SquaresFour,
  'streak-7': Flame,
  'streak-30': Crown,
  'word-3': Lightning,
  'groups-clean': Sparkle,
  'quiz-5': CalendarCheck,
  'sudoku-hard': GridNine,
  'points-1000': Trophy,
  'played-50': Medal,
};

export function StatsView() {
  const { me, openSignIn } = useAuth();
  const mine = useDailyMe();
  if (!me) {
    return (
      <Panel padding="lg" className="dh-stats__guest">
        <p className="dh-stats__guest-title">Your stats live in your account</p>
        <p className="dh-stats__guest-body">Sign in to keep your points, build a streak and earn badges.</p>
        <Button variant="primary" onClick={() => openSignIn()}>
          Sign in
        </Button>
      </Panel>
    );
  }
  if (mine.isError)
    return (
      <QueryError
        error={mine.error}
        title="Your stats didn’t load"
        onRetry={() => void mine.refetch()}
        retrying={mine.isFetching}
      />
    );
  if (mine.isPending) {
    return (
      <Panel padding="md">
        <Skeleton lines={4} />
      </Panel>
    );
  }
  const { stats, streak, badges } = mine.data;
  const solvedShare = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const earned = badges.filter((b) => b.earned).length;
  return (
    <div className="dh-stats">
      <dl className="dh-stats__tiles">
        <Tile label="Played" value={stats.played} />
        <Tile label="Solved" value={`${solvedShare}%`} />
        <Tile label="Current streak" value={streak.current} icon={Flame} />
        <Tile label="Best streak" value={streak.best} />
        <Tile label="Points this week" value={stats.weekPoints} />
        <Tile label="Points in all" value={stats.points} />
      </dl>

      <Panel padding="md" className={cx('dh-stats__freeze', streak.freezeReady && 'is-ready')}>
        <Snowflake
          className="dh-stats__freeze-icon"
          weight={streak.freezeReady ? 'fill' : 'regular'}
          aria-hidden="true"
        />
        <div>
          <p className="dh-stats__freeze-title">
            {streak.freezeReady ? 'This week’s freeze is ready' : 'This week’s freeze is used'}
          </p>
          <p className="dh-stats__freeze-body">
            Miss a day and the week’s freeze keeps your streak going, once a week. A new one comes each Sunday.
          </p>
        </div>
      </Panel>

      <section aria-labelledby="dh-badges">
        <h2 id="dh-badges" className="dh-stats__head">
          Badges{' '}
          <span className="dy-num">
            {earned} of {badges.length}
          </span>
        </h2>
        <ul className="dh-stats__badges">
          {badges.map((b) => {
            const BadgeIcon = BADGE_ICONS[b.id] ?? Medal;
            return (
              <li key={b.id} className={cx('dh-badge', b.earned ? 'is-earned' : 'is-locked')}>
                <span className="dh-badge__icon" aria-hidden="true">
                  <BadgeIcon weight={b.earned ? 'fill' : 'regular'} />
                  {!b.earned ? <Lock className="dh-badge__lock" weight="fill" /> : null}
                </span>
                <span className="dh-badge__text">
                  <span className="dh-badge__title">
                    {b.title}
                    <span className="visually-hidden">{b.earned ? ', earned' : ', not earned yet'}</span>
                  </span>
                  <span className="dh-badge__desc">{b.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, icon: TileIcon }: { label: string; value: number | string; icon?: Icon }) {
  return (
    <div className="dh-stats__tile">
      <dt>{label}</dt>
      <dd className="dy-num">
        {TileIcon ? <TileIcon weight="fill" aria-hidden="true" className="dh-stats__tile-icon" /> : null}
        {value}
      </dd>
    </div>
  );
}
