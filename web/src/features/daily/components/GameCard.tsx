// A game's tile on the hub: its art on the game's own tint (its picture in public/daily, the glyph drawn in code if
// that file can't load, or the play's own squares once it's finished), the name, one line about it, and its state
// in the corner. The whole tile is the link.
import { typeset } from '../../../api/errors';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../../ui';
import { gameLink, statusOf } from '../lib/status';
import { hasSquares, isOver, type GameDay, type GameId } from '../types';
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
          <GameArt game={game.info.id} />
        )}
      </span>
      <span className="dh-tile__name">{game.info.title}</span>
      <span className="dh-tile__state dy-num" data-noora-avoid="">
        {status.label}
      </span>
      <span className="dh-tile__line">{typeset(game.info.tagline)}</span>
    </Link>
  );
}

/** The game's picture, decorative (its name follows); the glyph drawn in code stands in when the file can't load. */
function GameArt({ game }: { game: GameId }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <GameGlyph game={game} />;
  return (
    <img
      className="dh-tile__img"
      src={`/daily/${game}.webp`}
      alt=""
      width={192}
      height={192}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
