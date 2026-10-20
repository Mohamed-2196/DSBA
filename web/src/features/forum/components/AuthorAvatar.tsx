import type { UserPublic } from '../../../api/types';
import { Avatar, cx, Icon, glyph } from '../../../ui';

const SIZES = { xs: 20, sm: 24, md: 32, lg: 40 } as const;

export interface AuthorAvatarProps {
  /** null: the account was deleted (or, with `guest`, nobody is signed in yet) */
  author: UserPublic | null | undefined;
  /** a composer seen by a guest: a neutral person, not the "?" of a deleted account (UX review UX-17) */
  guest?: boolean;
  size?: keyof typeof SIZES | number;
  className?: string;
}

/** Initials for a person; a plain grey disc for a deleted account. Always decorative (the name is printed next to it). */
export function AuthorAvatar({ author, guest = false, size = 'sm', className }: AuthorAvatarProps) {
  const px = typeof size === 'number' ? size : SIZES[size];
  const name = author?.displayName?.trim();
  if (!name) {
    return (
      <span
        className={cx('forum-avatar forum-avatar--ghost', guest && 'is-guest', className)}
        style={{ width: px, height: px, fontSize: Math.max(9, Math.round(px * (guest ? 0.55 : 0.42))) }}
        aria-hidden="true"
      >
        {guest ? <Icon glyph={glyph.user} /> : '?'}
      </span>
    );
  }
  return <Avatar name={name} size={px} decorative className={cx('forum-avatar', className)} />;
}
