import type { UserPublic } from '../../../api/types';
import { Avatar, cx } from '../../../ui';

const SIZES = { xs: 20, sm: 24, md: 32, lg: 40 } as const;

export interface AuthorAvatarProps {
  /** null: the account was deleted */
  author: UserPublic | null | undefined;
  size?: keyof typeof SIZES | number;
  className?: string;
}

/** Initials for a person; a plain grey disc for a deleted account. Always decorative (the name is printed next to it). */
export function AuthorAvatar({ author, size = 'sm', className }: AuthorAvatarProps) {
  const px = typeof size === 'number' ? size : SIZES[size];
  const name = author?.displayName?.trim();
  if (!name) {
    return (
      <span
        className={cx('forum-avatar forum-avatar--ghost', className)}
        style={{ width: px, height: px, fontSize: Math.max(9, Math.round(px * 0.42)) }}
        aria-hidden="true"
      >
        ?
      </span>
    );
  }
  return <Avatar name={name} size={px} decorative className={cx('forum-avatar', className)} />;
}
