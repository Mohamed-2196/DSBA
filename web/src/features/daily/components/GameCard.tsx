// A game's tile on the hub: its art on the game's own tint (the glyph, or the play's picture once it's finished),
// the name, one line about it, and its state in the corner. The whole tile is the link.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../../ui';
import { gameLink, statusOf } from '../lib/status';
import { hasSquares, isOver, type GameDay } from '../types';
import { GameGlyph } from './GameGlyph';
import { PlayPicture } from './PlayPicture';

export function GameCard({ game }: { game: GameDay }) {
  const status = statusOf(game);
  const picture = isOver(game.status) && hasSquares(game.picture) ? game.picture : null;
  return (
    <Link
      to={gameLink(game)}
      className={cx('dh-tile', `is-${status.tone}`)}
      data-game={game.info.id}
      style={{ '--g': `var(--dy-${game.info.id})` } as CSSProperties}
    >
      <span className={cx('dh-tile__art', picture && 'has-picture')} aria-hidden="true">
        {picture ? (
          <PlayPicture picture={picture} square={12} className="dh-tile__picture" />
        ) : (
          <GameGlyph game={game.info.id} />
        )}
      </span>
      <span className="dh-tile__name">{game.info.title}</span>
      <span className="dh-tile__state dy-num" data-noora-avoid="">
        {status.label}
      </span>
      <span className="dh-tile__line">{game.info.tagline}</span>
    </Link>
  );
}
