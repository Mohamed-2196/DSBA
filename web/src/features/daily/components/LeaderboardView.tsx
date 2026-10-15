import { useState } from 'react';
import { Trophy, ShieldCheck } from '@phosphor-icons/react';
import { Avatar, CohortBadge, SegmentedControl, Switch } from '../../../ui';
import { useDailyLeaderboard, useDailyMe, useUpdateDailyMe } from '../api';
import { useAuth } from '../../../auth';
import type { BoardPeriod } from '../types';

export function LeaderboardView() {
  const { me } = useAuth();
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [yearFilter, setYearFilter] = useState<number | null>(null);

  const { data: board, isLoading } = useDailyLeaderboard(period, yearFilter);
  const { data: myData } = useDailyMe();
  const updateMeMutation = useUpdateDailyMe();

  const isOptedIn = myData?.showOnBoard ?? false;

  const handleToggleOptIn = (checked: boolean) => {
    updateMeMutation.mutate(checked);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-20)' }}>
      {/* Privacy Opt-In Banner for signed-in users */}
      {me && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--sp-12)',
            padding: 'var(--sp-16)',
            borderRadius: 'var(--r-panel)',
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-12)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface)',
                color: 'var(--navy)',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: 'var(--fs-14)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink)' }}>
                Leaderboard Privacy (Opt-in)
              </h4>
              <p style={{ margin: 0, fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
                Show your name and cohort on the public board. Default is private.
              </p>
            </div>
          </div>

          <Switch
            id="daily-optin-switch"
            label={isOptedIn ? 'Visible on board' : 'Hidden (Private)'}
            checked={isOptedIn}
            onChange={handleToggleOptIn}
            disabled={updateMeMutation.isPending}
          />
        </div>
      )}

      {/* Filter controls: Period + Year */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-12)' }}>
        <SegmentedControl
          label="Leaderboard timeframe"
          value={period}
          onChange={(v) => setPeriod(v as BoardPeriod)}
          options={[
            { value: 'week', label: 'This Week' },
            { value: 'all', label: 'All Time' },
          ]}
        />

        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { label: 'All Years', val: null },
            { label: 'Year 1', val: 1 },
            { label: 'Year 2', val: 2 },
            { label: 'Year 3', val: 3 },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className={`chip ${yearFilter === item.val ? 'active' : ''}`}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--line)',
                backgroundColor: yearFilter === item.val ? 'var(--navy)' : 'var(--surface)',
                color: yearFilter === item.val ? 'var(--cobalt-ink)' : 'var(--ink)',
                fontSize: 'var(--fs-12)',
                fontWeight: 'var(--fw-medium)',
                cursor: 'pointer',
              }}
              onClick={() => setYearFilter(item.val)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard Table */}
      <div
        style={{
          borderRadius: 'var(--r-panel)',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--line)',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div style={{ padding: 'var(--sp-32)', textAlign: 'center', color: 'var(--ink-2)' }}>
            Loading leaderboard...
          </div>
        ) : !board || board.rows.length === 0 ? (
          <div style={{ padding: 'var(--sp-32)', textAlign: 'center', color: 'var(--ink-2)' }}>
            <Trophy size={40} style={{ opacity: 0.4, marginBottom: '8px' }} />
            <p style={{ margin: 0, fontWeight: 'var(--fw-medium)' }}>No players on the board yet.</p>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-13)' }}>
              Complete today&apos;s puzzles and opt-in to see your name here!
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', backgroundColor: 'var(--surface-2)', fontSize: 'var(--fs-12)', color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px', width: '60px' }}>Rank</th>
                <th style={{ padding: '12px 16px' }}>Player</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Played</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr
                  key={row.rank + row.user.id}
                  style={{
                    borderBottom: '1px solid var(--line)',
                    backgroundColor: row.you ? 'var(--highlight-soft)' : undefined,
                  }}
                >
                  <td style={{ padding: '12px 16px', fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-14)' }}>
                    {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={row.user.displayName || 'Player'} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: row.you ? 'var(--fw-bold)' : 'var(--fw-medium)', color: 'var(--ink)', fontSize: 'var(--fs-14)' }}>
                            {row.user.displayName || 'Student'}
                          </span>
                          {row.you && (
                            <span style={{ fontSize: 'var(--fs-11)', padding: '1px 6px', borderRadius: 'var(--r-pill)', backgroundColor: 'var(--navy)', color: 'var(--cobalt-ink)' }}>
                              You
                            </span>
                          )}
                        </div>
                        {row.user.year && (
                          <div style={{ marginTop: '2px' }}>
                            <CohortBadge year={row.user.year} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 'var(--fs-14)', color: 'var(--ink-2)' }}>
                    {row.played}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-15)', color: 'var(--ink)' }}>
                    {row.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
