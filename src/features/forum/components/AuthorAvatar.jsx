import { HeartStraight } from '@phosphor-icons/react';
import { Avatar, PulseMark, cx } from '../../../ui';

const SIZES = { xs: 20, sm: 24, md: 32, lg: 40 };

/**
 * Avatar for a forum author: initials for students, the pulse tile for the student-run
 * DSBA Pulse account (a rounded square, so it reads as an account rather than a person).
 */
export function AuthorAvatar({ author, size = 'sm', className }) {
  const px = typeof size === 'number' ? size : SIZES[size] || 24;
  if (author?.kind === 'team') {
    return <PulseMark tile size={px} className={cx('forum-avatar', className)} />;
  }
  if (author?.kind === 'everyone') {
    return (
      <span className={cx('forum-avatar forum-avatar--everyone', className)} style={{ width: px, height: px, fontSize: Math.round(px * 0.5) }} aria-hidden="true">
        <HeartStraight weight="fill" />
      </span>
    );
  }
  return <Avatar name={author?.name || '?'} size={px} decorative className={cx('forum-avatar', className)} />;
}
