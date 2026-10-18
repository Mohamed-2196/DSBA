// The result card at the end of a play: what it came to, the points and streak, the shareable grid, and the way to
// the next puzzle.
import { ArrowRight, Flame } from '@phosphor-icons/react';
import { Button, Modal } from '../../../ui';
import { HELD, resultOf } from '../lib/result';
import type { GameDay, PlayOut, Streak } from '../types';
import { GameTile } from './GameGlyph';
import { ShareButton } from './ShareButton';

export interface ResultDialogProps {
  open: boolean;
  onClose: () => void;
  out: PlayOut;
  signedIn: boolean;
  /** a guest's play of today's set: its answers wait for an account, or for tomorrow */
  secret: boolean;
  /** today's streak, when the play counted */
  streak: Streak | null;
  /** the next game to play today, if any */
  next: GameDay | null;
  onSignIn: () => void;
}

export function ResultDialog({ open, onClose, out, signedIn, secret, streak, next, onSignIn }: ResultDialogProps) {
  const { play, info } = out;
  const result = resultOf(play, secret);
  const won = play.status === 'won';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result.headline}
      description={`${info.title} #${play.number}`}
      size="sm"
      className="dy dg-result"
    >
      <div className="dg-result__body">
        <div className={`dg-result__hero${won ? ' is-won' : ''}`}>
          <GameTile game={info.id} size={52} />
          <p className="dg-result__summary">
            {result.summary}
            {result.answer ? (
              <>
                {' '}
                <strong className="dg-result__answer">{result.answer}</strong>
              </>
            ) : null}
          </p>
        </div>
        {result.held ? <p className="dg-result__held">{HELD}</p> : null}

        <div className="dg-result__chips">
          {play.scored ? (
            play.points > 0 ? (
              <span className="dy-chip dy-chip--points dy-num">+{play.points} points</span>
            ) : null
          ) : signedIn ? (
            <span className="dy-chip">Practice: no points</span>
          ) : (
            <span className="dy-chip">Guest: not kept</span>
          )}
          {play.tooFast ? <span className="dy-chip">Too fast to count</span> : null}
          {play.scored && streak && streak.current > 0 ? (
            <span className="dy-chip dy-chip--streak dy-num">
              <Flame weight="fill" aria-hidden="true" />
              {streak.current}-day streak
            </span>
          ) : null}
        </div>

        {play.share ? <pre className="dy-share-card">{play.share}</pre> : null}

        <div className="dg-result__actions">
          {play.share ? <ShareButton share={play.share} fullWidth /> : null}
          {!signedIn ? (
            <Button variant="secondary" fullWidth onClick={onSignIn}>
              Sign in to keep your points
            </Button>
          ) : null}
          {next ? (
            <Button
              variant="secondary"
              fullWidth
              to={next.variant ? `/daily/${next.info.id}?difficulty=${next.variant}` : `/daily/${next.info.id}`}
              trailingIcon={ArrowRight}
              onClick={onClose}
            >
              Next: {next.info.title}
            </Button>
          ) : (
            <Button variant="secondary" fullWidth to="/daily" onClick={onClose}>
              Back to Daily
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
