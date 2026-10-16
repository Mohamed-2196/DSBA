import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Flame, Trophy } from '@phosphor-icons/react';
import { Panel, QueryError, Skeleton, cx } from '../../ui';
import { useDailyToday } from './api';
import { GAME_REGISTRY } from './games/registry';
import type { GameId } from './types';
import './DailyCard.css';

const SHORT_HINTS: Record<GameId, string> = {
  word: '5-letter word',
  groups: '4 groups of 4',
  search: '8 hidden words',
  quiz: '5 quick questions',
  nearest: 'Secret word',
  sudoku: '9×9 logic grid',
};

export function DailyCard() {
  const { data: today, isLoading, isError, error, refetch, isFetching } = useDailyToday();

  if (isLoading) {
    return (
      <Panel padding="none" className="home-daily" aria-busy="true">
        <span className="visually-hidden">Loading daily puzzles</span>
        <div className="home-daily__loading" aria-hidden="true">
          <Skeleton width="45%" height={16} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="65%" height={14} />
        </div>
      </Panel>
    );
  }

  if (isError) {
    return (
      <QueryError
        error={error}
        title="Daily puzzles didn’t load"
        size="sm"
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }

  if (!today) return null;

  const total = today.games.length || 1;
  const pct = Math.round((today.done / total) * 100);

  return (
    <Panel padding="none" className="home-daily" data-hub="home-daily">
      <div className="home-daily__head">
        <div className="home-daily__theme">
          <span className="home-daily__kicker">This week’s theme</span>
          <span className="home-daily__title">{today.theme.title}</span>
        </div>

        <div className="home-daily__stats">
          {today.streak && today.streak.current > 0 ? (
            <span className="home-daily__pill home-daily__pill--streak" title="Current day streak">
              <Flame size={13} weight="fill" aria-hidden="true" />
              <span className="u-tabular">{today.streak.current}d</span>
            </span>
          ) : null}
          <span className="home-daily__pill u-tabular">
            {today.done} of {today.games.length} solved
          </span>
          <span className="home-daily__pill home-daily__pill--pts u-tabular">
            <Trophy size={13} weight="fill" aria-hidden="true" />
            <span>+{today.points} pts</span>
          </span>
        </div>

        {pct > 0 ? (
          <span
            className="home-daily__bar"
            style={{ '--pct': `${pct}%` } as CSSProperties}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <ul role="list" className="home-daily__grid">
        {today.games.map((g) => {
          const id = g.info.id as GameId;
          const plugin = GAME_REGISTRY[id];
          const Icon = plugin?.icon;
          const isWon = g.status === 'won';
          const isLost = g.status === 'lost';
          const isPlaying = g.status === 'playing';
          const isDone = isWon || isLost;

          return (
            <li key={g.info.id} className="home-daily__cell">
              <Link
                to={`/daily/${g.info.id}`}
                className={cx('home-daily__item', isDone && 'home-daily__item--done')}
                style={{ '--game-c': plugin?.accentColor } as CSSProperties}
              >
                <span className="home-daily__icon" aria-hidden="true">
                  {Icon ? <Icon size={18} weight="duotone" /> : null}
                </span>
                <span className="home-daily__text">
                  <span className="home-daily__name">{plugin?.title ?? g.info.title}</span>
                  {isWon ? (
                    <span className="home-daily__meta home-daily__meta--won">
                      <CheckCircle size={13} weight="fill" aria-hidden="true" />
                      <span className="u-tabular">Solved · +{g.points} pts</span>
                    </span>
                  ) : isLost ? (
                    <span className="home-daily__meta u-tabular">Completed · +{g.points} pts</span>
                  ) : isPlaying ? (
                    <span className="home-daily__meta home-daily__meta--playing">In progress</span>
                  ) : (
                    <span className="home-daily__meta">{SHORT_HINTS[id] ?? g.info.tagline}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
