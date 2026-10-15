import { Link } from 'react-router-dom';
import { CheckCircle, Flame, GameController, Play, Trophy } from '@phosphor-icons/react';
import { Button, Panel } from '../../ui';
import { useDailyToday } from './api';
import { GAME_REGISTRY } from './games/registry';
import type { GameId } from './types';

export function DailyCard() {
  const { data: today, isLoading } = useDailyToday();

  if (isLoading) {
    return (
      <Panel style={{ padding: 'var(--sp-20)' }}>
        <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)' }}>
          Loading daily puzzles...
        </div>
      </Panel>
    );
  }

  if (!today) return null;

  return (
    <Panel style={{ padding: 'var(--sp-20)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-16)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: 'var(--r-control)',
              backgroundColor: 'var(--navy)',
              color: 'var(--cobalt-ink)',
            }}
          >
            <GameController size={20} weight="fill" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-16)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
              Today&apos;s Daily
            </h3>
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-2)' }}>
              {today.theme.title}
            </span>
          </div>
        </div>

        {today.streak && today.streak.current > 0 && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: 'var(--r-pill)',
              backgroundColor: 'var(--highlight-soft)',
              color: '#A35E00',
              fontSize: 'var(--fs-12)',
              fontWeight: 'var(--fw-bold)',
            }}
          >
            <Flame size={14} weight="fill" />
            <span>{today.streak.current} day streak</span>
          </div>
        )}
      </div>

      {/* Progress & Points Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--sp-10) var(--sp-14)',
          borderRadius: 'var(--r-control)',
          backgroundColor: 'var(--surface-2)',
          fontSize: 'var(--fs-13)',
        }}
      >
        <span style={{ fontWeight: 'var(--fw-medium)', color: 'var(--ink)' }}>
          {today.done} of {today.games.length} completed
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'var(--fw-bold)', color: 'var(--signal-strong)' }}>
          <Trophy size={14} weight="fill" />
          <span>+{today.points} pts</span>
        </div>
      </div>

      {/* Mini Game Icons Row */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
        {today.games.map((g) => {
          const plugin = GAME_REGISTRY[g.info.id as GameId];
          const isDone = g.status === 'won' || g.status === 'lost';
          return (
            <Link
              key={g.info.id}
              to={`/daily/${g.info.id}`}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '42px',
                height: '42px',
                borderRadius: 'var(--r-control)',
                backgroundColor: isDone ? 'var(--signal-soft)' : 'var(--surface-2)',
                color: isDone ? 'var(--signal-strong)' : 'var(--ink-2)',
                border: '1px solid var(--line)',
                textDecoration: 'none',
              }}
              title={g.info.title}
            >
              {plugin && <plugin.icon size={20} />}
              {isDone && (
                <div style={{ position: 'absolute', top: -4, right: -4 }}>
                  <CheckCircle size={14} weight="fill" color="var(--signal)" />
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Play Link */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-4)' }}>
        <Link to="/daily">
          <Button variant="primary" size="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Play size={14} weight="fill" />
            <span>Open Daily</span>
          </Button>
        </Link>
      </div>
    </Panel>
  );
}
