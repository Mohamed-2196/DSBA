// Home's Daily card: today's set number and theme, how far you got and your streak, and the six games, each a tap
// from its puzzle.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Flame } from '@phosphor-icons/react';
import { Panel, QueryError, Skeleton, cx } from '../../ui';
import { useDailyToday } from './api';
import { GameTile } from './components/GameGlyph';
import { gameLink, statusOf } from './lib/status';
import './daily.css';
import './DailyCard.css';

export function DailyCard() {
  const today = useDailyToday();

  // What has loaded stays on screen when a later refresh fails.
  if (today.data === undefined && !today.isError) {
    return (
      <Panel padding="none" className="dy home-daily" aria-busy="true">
        <span className="visually-hidden">Loading the daily puzzles</span>
        <div className="home-daily__loading" aria-hidden="true">
          <Skeleton width="45%" height={16} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="65%" height={14} />
        </div>
      </Panel>
    );
  }
  if (today.data === undefined) {
    return (
      <QueryError
        error={today.error}
        title="The daily puzzles didn’t load"
        size="sm"
        onRetry={() => void today.refetch()}
        retrying={today.isFetching}
      />
    );
  }

  const { data } = today;
  const total = data.games.length || 1;
  const streak = data.streak?.current ?? 0;
  return (
    <Panel padding="none" className="dy home-daily" data-hub="home-daily">
      <div className="home-daily__head">
        <div className="home-daily__theme">
          <span className="home-daily__kicker dy-num">Daily #{data.number}</span>
          <span className="home-daily__title">{data.theme.title}</span>
        </div>
        <div className="home-daily__stats">
          {streak > 0 ? (
            <span className="dy-chip dy-chip--streak dy-num" title="Days in a row with a puzzle finished">
              <Flame weight="fill" aria-hidden="true" />
              {streak}-day streak
            </span>
          ) : null}
          <span className="dy-chip dy-num">
            {data.done} of {data.games.length} done
          </span>
        </div>
        <span
          className="home-daily__bar"
          style={{ '--pct': `${Math.round((data.done / total) * 100)}%` } as CSSProperties}
          aria-hidden="true"
        />
      </div>

      <ul role="list" className="home-daily__grid">
        {data.games.map((g) => {
          const status = statusOf(g);
          const done = status.tone === 'won' || status.tone === 'lost';
          return (
            <li key={g.info.id}>
              <Link to={gameLink(g)} className={cx('home-daily__item', done && 'is-done')}>
                <span className="home-daily__icon">
                  <GameTile game={g.info.id} size={36} />
                  {done ? <CheckCircle className="home-daily__check" weight="fill" aria-hidden="true" /> : null}
                </span>
                <span className="home-daily__text">
                  <span className="home-daily__name">{g.info.title}</span>
                  <span
                    className={cx(
                      'home-daily__meta dy-num',
                      status.tone === 'playing' && 'is-playing',
                      status.tone === 'won' && 'is-won',
                    )}
                  >
                    {status.tone === 'new' ? 'Not started' : status.label}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
