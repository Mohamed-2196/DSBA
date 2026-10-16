import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Flame,
  GameController,
  Play,
  Sparkle,
  Trophy,
} from '@phosphor-icons/react';
import { Button, Page, PageHeader, QueryError, Skeleton, Tabs } from '../../ui';
import { useDailyToday } from './api';
import { GAME_REGISTRY } from './games/registry';
import { LeaderboardView } from './components/LeaderboardView';
import { CalendarArchiveView } from './components/CalendarArchiveView';
import { BadgesView } from './components/BadgesView';
import { formatCountdown } from './lib/time';
import type { GameDay } from './types';
import './DailyPage.css';

export default function DailyPage() {
  const { data: today, isLoading, error, refetch } = useDailyToday();
  const [activeTab, setActiveTab] = useState('puzzles');
  const [countdown, setCountdown] = useState('');

  // Live countdown update
  useEffect(() => {
    if (!today?.nextAt) return;
    const interval = setInterval(() => {
      setCountdown(formatCountdown(today.nextAt));
    }, 1000);
    setCountdown(formatCountdown(today.nextAt));
    return () => clearInterval(interval);
  }, [today?.nextAt]);

  const tabs = [
    { id: 'puzzles', label: "Today's Puzzles" },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'calendar', label: 'Archive' },
    { id: 'badges', label: 'My Stats & Badges' },
  ];

  return (
    <Page>
      <PageHeader
        title="Daily"
        description="Fresh data science, finance, and logic puzzles released every midnight in Bahrain."
      />

      <div className="daily-page-container">
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-16)' }}>
            <Skeleton style={{ height: '120px', borderRadius: 'var(--r-panel)' }} />
            <Skeleton style={{ height: '70px', borderRadius: 'var(--r-panel)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--sp-16)' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} style={{ height: '180px', borderRadius: 'var(--r-panel)' }} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <QueryError
            title="Could not load daily puzzles"
            error={error}
            onRetry={() => refetch()}
          />
        )}

        {today && (
          <>
            {/* Weekly Theme Banner */}
            <div className="daily-theme-banner">
              <div className="daily-theme-left">
                <div className="daily-theme-pill">
                  <Sparkle size={16} weight="fill" />
                  <span>Weekly Theme</span>
                </div>
                <h2 className="daily-theme-title">{today.theme.title}</h2>
                <p className="daily-theme-blurb">{today.theme.blurb}</p>
              </div>

              <div className="daily-countdown-box">
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={16} />
                  <span>Next puzzles in:</span>
                </div>
                <span className="daily-countdown-time">{countdown || '00:00:00'}</span>
              </div>
            </div>

            {/* Daily Stats Bar */}
            <div className="daily-stats-bar">
              <div className="daily-stat-tile">
                <div className="daily-stat-icon-box" style={{ color: 'var(--cobalt)' }}>
                  <GameController size={24} weight="fill" />
                </div>
                <div className="daily-stat-info">
                  <span className="daily-stat-num">{today.done} / {today.games.length}</span>
                  <span className="daily-stat-label">Puzzles Completed</span>
                </div>
              </div>

              <div className="daily-stat-tile">
                <div className="daily-stat-icon-box" style={{ color: 'var(--signal-strong)' }}>
                  <Trophy size={24} weight="fill" />
                </div>
                <div className="daily-stat-info">
                  <span className="daily-stat-num">+{today.points}</span>
                  <span className="daily-stat-label">Points Today</span>
                </div>
              </div>

              {today.streak && (
                <div className="daily-stat-tile">
                  <div className="daily-stat-icon-box" style={{ color: '#F08C00' }}>
                    <Flame size={24} weight="fill" />
                  </div>
                  <div className="daily-stat-info">
                    <span className="daily-stat-num">{today.streak.current} Days</span>
                    <span className="daily-stat-label">
                      Streak {today.streak.freezeReady ? '❄️ Freeze Ready' : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs Navigation */}
            <Tabs
              tabs={tabs}
              value={activeTab}
              onChange={setActiveTab}
              label="Daily sections"
            />

            {/* Tab: Today's Puzzles */}
            {activeTab === 'puzzles' && (
              <div className="daily-games-grid" role="region" aria-label="Today's games set">
                {today.games.map((gameDay: GameDay) => {
                  const plugin = GAME_REGISTRY[gameDay.info.id];
                  if (!plugin) return null;
                  const { title, tagline, icon: Icon, accentColor } = plugin;

                  const isWon = gameDay.status === 'won';
                  const isLost = gameDay.status === 'lost';
                  const isPlaying = gameDay.status === 'playing';

                  let statusLabel = 'Ready to play';
                  let statusClass = 'daily-game-status-new';

                  if (isWon) {
                    statusLabel = `Solved • +${gameDay.points} pts`;
                    statusClass = 'daily-game-status-won';
                  } else if (isLost) {
                    statusLabel = `Completed • +${gameDay.points} pts`;
                    statusClass = 'daily-game-status-lost';
                  } else if (isPlaying) {
                    statusLabel = 'In Progress';
                    statusClass = 'daily-game-status-playing';
                  }

                  return (
                    <div key={gameDay.info.id} className="daily-game-card">
                      <div>
                        <div className="daily-game-card-top">
                          <div className="daily-game-icon-title">
                            <div className="daily-game-card-icon" style={{ backgroundColor: accentColor }}>
                              <Icon size={24} weight="bold" />
                            </div>
                            <h3 className="daily-game-card-title">{title}</h3>
                          </div>
                          <span className={`daily-game-status-badge ${statusClass}`}>
                            {isWon && <CheckCircle size={14} weight="fill" />}
                            <span>{statusLabel}</span>
                          </span>
                        </div>
                        <p className="daily-game-card-tagline">{tagline}</p>
                      </div>

                      <div className="daily-game-card-footer">
                        <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)', fontWeight: 'var(--fw-medium)' }}>
                          Max {gameDay.info.maxPoints} pts
                        </span>
                        <Button
                          to={`/daily/${gameDay.info.id}`}
                          variant={isWon || isLost ? 'secondary' : 'primary'}
                          size="sm"
                          leadingIcon={Play}
                        >
                          {isWon || isLost ? 'Review' : isPlaying ? 'Continue' : 'Play'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tab: Leaderboard */}
            {activeTab === 'leaderboard' && <LeaderboardView />}

            {/* Tab: Archive Calendar */}
            {activeTab === 'calendar' && <CalendarArchiveView />}

            {/* Tab: Badges & My Stats */}
            {activeTab === 'badges' && <BadgesView />}
          </>
        )}
      </div>
    </Page>
  );
}
