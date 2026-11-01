// A game's card on the hub, in DSBA Daily's look: the game's picture on its own tint, its name and one line about it,
// and a badge for how far you got (Play, In progress, Done with the points). The whole card is the link.
import { typeset } from '../../../api/errors';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { cx, glyph, Icon } from '../../../ui';
import { gameLink, statusOf } from '../lib/status';
import type { GameDay } from '../types';
import { GameGlyph } from './GameGlyph';

export function GameCard({ game }: { game: GameDay }) {
  const status = statusOf(game);
  const id = game.info.id;
  return (
    <Link
      to={gameLink(game)}
      className={cx('dh-card', `is-${status.tone}`)}
      data-game={id}
      style={{ '--g': `var(--dd-${id})`, '--g-soft': `var(--dd-${id}-soft)` } as CSSProperties}
    >
      <span className="dh-card__art" aria-hidden="true">
        <GameGlyph game={id} />
      </span>
      <span className="dh-card__body">
        <span className="dh-card__name">{game.info.title}</span>
        <span className="dh-card__line">{typeset(game.info.tagline)}</span>
        <span className="dh-card__foot">
          <span className={cx('dh-badge', `is-${status.tone}`)} data-noora-avoid="">
            {status.tone === 'won' || status.tone === 'lost' ? (
              <Icon glyph={glyph.check} className="dh-badge__icon" aria-hidden="true" />
            ) : null}
            {badgeText(game)}
          </span>
        </span>
      </span>
      <Icon glyph={glyph.chevronRight} className="dh-card__chevron" aria-hidden="true" />
    </Link>
  );
}

/** DSBA Daily's words for a game's state: Play, In progress, Done · 80 pts (Not solved when it earned nothing). */
function badgeText(game: GameDay): string {
  const tone = statusOf(game).tone;
  if (tone === 'playing') return 'In progress';
  if (tone === 'new') return 'Play';
  if (game.scored && game.points > 0) return `Done · ${game.points} pts`;
  return tone === 'won' ? 'Done' : 'Not solved';
}
