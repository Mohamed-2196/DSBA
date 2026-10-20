// Your stats: what you've played, your streak and its weekly freeze, and the badges, earned and still to earn.
import { useAuth } from '../../../auth';
import { Button, Panel, QueryError, Skeleton, cx, glyph, Icon, type Glyph } from '../../../ui';
import { useDailyMe } from '../api';

const BADGE_ICONS: Record<string, Glyph> = {
  first: glyph.star,
  'full-set': glyph.gridView,
  'streak-7': glyph.flame,
  'streak-30': glyph.crown,
  'word-3': glyph.bolt,
  'groups-clean': glyph.sparkle,
  'quiz-5': glyph.calendarCheck,
  'sudoku-hard': glyph.daily,
  'points-1000': glyph.trophy,
  'played-50': glyph.medal,
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
        <Tile label="Current streak" value={streak.current} icon={glyph.flame} />
        <Tile label="Best streak" value={streak.best} />
        <Tile label="Points this week" value={stats.weekPoints} />
        <Tile label="Points in all" value={stats.points} />
      </dl>

      <Panel padding="md" className={cx('dh-stats__freeze', streak.freezeReady && 'is-ready')}>
        <Icon glyph={glyph.snowflake} className="dh-stats__freeze-icon" active={streak.freezeReady} />
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
            const badgeGlyph = BADGE_ICONS[b.id] ?? glyph.medal;
            return (
              <li key={b.id} className={cx('dh-badge', b.earned ? 'is-earned' : 'is-locked')}>
                <span className="dh-badge__icon" aria-hidden="true">
                  <Icon glyph={badgeGlyph} active={b.earned} />
                  {!b.earned ? <Icon glyph={glyph.lock} className="dh-badge__lock" active /> : null}
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

function Tile({ label, value, icon }: { label: string; value: number | string; icon?: Glyph }) {
  return (
    <div className="dh-stats__tile">
      <dt>{label}</dt>
      <dd className="dy-num">
        {icon ? <Icon glyph={icon} active className="dh-stats__tile-icon" /> : null}
        {value}
      </dd>
    </div>
  );
}
