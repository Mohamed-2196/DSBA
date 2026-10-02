import { useState } from 'react';
import { ArrowFatUp } from '@phosphor-icons/react';
import { cx } from '../../../ui';
import { RollingNumber } from './RollingNumber.jsx';

/**
 * Upvote toggle. Optimistic: the count changes the moment you click (the arrow fills and pops,
 * the number rolls). `layout`: 'stack' (thread rows, the original post) | 'inline' (replies).
 */
export function VoteButton({ count, voted, onToggle, layout = 'stack', size = 'md', className }) {
  const [pops, setPops] = useState(0);
  return (
    <button
      type="button"
      className={cx('forum-vote', `forum-vote--${layout}`, `forum-vote--${size}`, voted && 'is-voted', className)}
      aria-pressed={voted}
      aria-label={`Upvote, ${count} ${count === 1 ? 'vote' : 'votes'}`}
      data-hub="vote"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!voted) setPops((n) => n + 1);
        onToggle?.();
      }}
    >
      <ArrowFatUp
        key={pops}
        weight={voted ? 'fill' : 'bold'}
        className={cx('forum-vote__icon', voted && pops > 0 && 'is-popping')}
        aria-hidden="true"
      />
      <RollingNumber value={count} className="forum-vote__count" />
    </button>
  );
}
