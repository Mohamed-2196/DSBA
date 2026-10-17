// A game on the hub: its glyph, name and line, how far you got today, and the way in. The whole card is the link.
import { CheckCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { cx } from '../../../ui';
import { gameLink, statusOf } from '../lib/status';
import type { GameDay } from '../types';
import { GameTile } from './GameGlyph';

export function GameCard({ game }: { game: GameDay }) {
  const status = statusOf(game);
  const done = status.tone === 'won' || status.tone === 'lost';
  return (
    <Link to={gameLink(game)} className={cx('dh-card', `is-${status.tone}`)} data-game={game.info.id}>
      <span className="dh-card__art">
        <GameTile game={game.info.id} size={56} />
        {done ? <CheckCircle className="dh-card__done" weight="fill" aria-hidden="true" /> : null}
      </span>
      <span className="dh-card__text">
        <span className="dh-card__name">{game.info.title}</span>
        <span className="dh-card__line">{game.info.tagline}</span>
      </span>
      <span className="dh-card__foot">
        <span className={cx('dy-chip', status.tone === 'won' && 'dy-chip--won', status.tone === 'playing' && 'dy-chip--playing', 'dy-num')}>{status.label}</span>
        <span className="dh-card__go" aria-hidden="true" data-noora-avoid="">
          {status.action}
        </span>
      </span>
    </Link>
  );
}
