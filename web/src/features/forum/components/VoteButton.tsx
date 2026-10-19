import { useState } from 'react';
import { useAuth } from '../../../auth';
import { Icon, cx, glyph } from '../../../ui';
import { RollingNumber } from './RollingNumber';

export interface VoteButtonProps {
  count: number;
  voted: boolean;
  onToggle?: () => void;
  /** no pill until hovered or voted (a thread card's counts) */
  quiet?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Upvote toggle: the vote arrow and the count in a pill. The count changes the moment you click (the arrow fills and
 * pops, the number rolls); the request runs behind it and a failure puts it back (see api.ts useThreadVote /
 * useReplyVote). An account without the forum.post box sees the count with the button disabled; guests are asked to
 * sign in when they click.
 */
export function VoteButton({ count, voted, onToggle, quiet = false, disabled = false, className }: VoteButtonProps) {
  const [pops, setPops] = useState(0);
  const { mayTry } = useAuth();
  const votes = mayTry('forum.post');
  const tally = `${count} ${count === 1 ? 'vote' : 'votes'}`;
  return (
    <button
      type="button"
      className={cx('forum-vote', quiet && 'forum-vote--quiet', voted && 'is-voted', className)}
      aria-pressed={voted}
      aria-label={votes ? `Upvote, ${tally}` : `${tally}. Voting isn’t on your account`}
      title={votes ? undefined : 'Voting isn’t on your account'}
      data-hub="vote"
      disabled={disabled || !votes}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!voted) setPops((n) => n + 1);
        onToggle?.();
      }}
    >
      <Icon key={pops} glyph={glyph.vote} className={cx('forum-vote__icon', voted && pops > 0 && 'is-popping')} />
      <RollingNumber value={count} className="forum-vote__count" />
    </button>
  );
}
