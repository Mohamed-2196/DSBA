import { Trophy, Medal, Flame, Snowflake, Lock } from '@phosphor-icons/react';
import { useDailyMe } from '../api';
import { useAuth } from '../../../auth';

export function BadgesView() {
  const { me } = useAuth();
  const { data: myData, isLoading } = useDailyMe();

  if (!me) {
    return (
      <div style={{ padding: 'var(--sp-32)', textAlign: 'center', color: 'var(--ink-2)', borderRadius: 'var(--r-panel)', backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}>
        <Trophy size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
        <h3 style={{ margin: '0 0 8px', color: 'var(--ink)' }}>Sign in to track stats and milestones</h3>
        <p style={{ margin: 0, fontSize: 'var(--fs-14)' }}>
          Playing signed in tracks your daily streaks, earned points, and milestone badges.
        </p>
      </div>
    );
  }

  if (isLoading || !myData) {
    return (
      <div style={{ padding: 'var(--sp-32)', textAlign: 'center', color: 'var(--ink-2)' }}>
        Loading your achievements...
      </div>
    );
  }

  const { stats, streak, badges } = myData;
  const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-24)' }}>
      {/* Overview Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--sp-12)',
        }}
      >
        <div style={{ padding: 'var(--sp-16)', borderRadius: 'var(--r-panel)', backgroundColor: 'var(--surface)', border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--fs-25)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
            {stats.played}
          </div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)', marginTop: '4px' }}>
            Puzzles Played
          </div>
        </div>

        <div style={{ padding: 'var(--sp-16)', borderRadius: 'var(--r-panel)', backgroundColor: 'var(--surface)', border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--fs-25)', fontWeight: 'var(--fw-bold)', color: 'var(--signal-strong)' }}>
            {winRate}%
          </div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)', marginTop: '4px' }}>
            Win Rate ({stats.won} wins)
          </div>
        </div>

        <div style={{ padding: 'var(--sp-16)', borderRadius: 'var(--r-panel)', backgroundColor: 'var(--surface)', border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <Flame size={26} color="#F08C00" weight="fill" />
            <span style={{ fontSize: 'var(--fs-25)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
              {streak.current}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)', marginTop: '4px' }}>
            Current Streak (Best: {streak.best})
          </div>
        </div>

        <div style={{ padding: 'var(--sp-16)', borderRadius: 'var(--r-panel)', backgroundColor: 'var(--surface)', border: '1px solid var(--line)', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--fs-25)', fontWeight: 'var(--fw-bold)', color: 'var(--cobalt)' }}>
            {stats.points}
          </div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)', marginTop: '4px' }}>
            All-Time Points ({stats.weekPoints} this week)
          </div>
        </div>
      </div>

      {/* Streak Freeze Info Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-16)',
          padding: 'var(--sp-16)',
          borderRadius: 'var(--r-panel)',
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--line)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: streak.freezeReady ? 'var(--cobalt-soft)' : 'var(--surface)',
            color: streak.freezeReady ? 'var(--cobalt)' : 'var(--ink-3)',
          }}
        >
          <Snowflake size={24} weight={streak.freezeReady ? 'fill' : 'regular'} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: 'var(--fs-14)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
            Weekly Streak Freeze: {streak.freezeReady ? 'Ready & Active' : 'Used This Week'}
          </h4>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
            You get 1 free streak freeze every week. If you miss a day, your streak will be protected automatically.
          </p>
        </div>
      </div>

      {/* Badges Grid */}
      <div>
        <h3 style={{ margin: '0 0 var(--sp-16)', fontSize: 'var(--fs-18)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
          Milestone Badges ({badges.filter((b) => b.earned).length}/{badges.length})
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--sp-12)',
          }}
        >
          {badges.map((badge) => {
            const isEarned = badge.earned;
            return (
              <div
                key={badge.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--sp-12)',
                  padding: 'var(--sp-16)',
                  borderRadius: 'var(--r-control)',
                  backgroundColor: 'var(--surface)',
                  border: isEarned ? '1px solid var(--line-strong)' : '1px dashed var(--line)',
                  opacity: isEarned ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: isEarned ? 'var(--highlight-soft)' : 'var(--surface-2)',
                    color: isEarned ? '#A35E00' : 'var(--ink-3)',
                    flexShrink: 0,
                  }}
                >
                  {isEarned ? <Medal size={20} weight="fill" /> : <Lock size={18} />}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 2px', fontSize: 'var(--fs-14)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
                    {badge.title}
                  </h4>
                  <p style={{ margin: 0, fontSize: 'var(--fs-12)', color: 'var(--ink-2)', lineHeight: 1.4 }}>
                    {badge.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
