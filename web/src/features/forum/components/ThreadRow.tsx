import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ThreadSummary } from '../../../api/types';
import { Badge, Icon, Skeleton, cx, glyph, timeAgo } from '../../../ui';
import { useModules } from '../../../state/modules';
import { postAuthorName, unnamed } from '../lib/authors';
import { mediaSrc } from '../lib/links';
import { isNew } from '../lib/time';
import { AuthorAvatar } from './AuthorAvatar';
import { VoteButton } from './VoteButton';
import {
  AnsweredBadge,
  AuthorFlair,
  HighlightedText,
  ModuleChip,
  PlaceBadge,
  ReplyCount,
  TagBadges,
} from './ThreadBits';

export interface ThreadRowProps {
  thread: ThreadSummary;
  onVote?: (thread: ThreadSummary) => void;
  /** the time shown: when it was posted, or its newest activity (Yours) */
  time?: 'posted' | 'activity';
  /** search terms to mark in the title and excerpt (the excerpt shows only while searching) */
  terms?: string[];
  showModule?: boolean;
  headingLevel?: 2 | 3 | 4;
}

/**
 * One thread as a card (docs/design/deskmates/screens/forum-list-*): the title, then the module code, the place and
 * who started it with the time, and on the right the replies, the vote and "Answered". A thread with something new
 * for you (`unread`) gets the pink rule down its edge and a "New activity" line. A post with a picture shows a small
 * thumbnail (an icon on narrow rows).
 * The whole card is clickable (stretched title link); the vote button sits above it.
 * Titles and excerpts are dir="auto": an Arabic title sits right-aligned, an English one stays left-aligned
 * (the vote, author, badges and counts around them stay left-to-right).
 */
export function ThreadRow({
  thread,
  onVote,
  time = 'posted',
  terms,
  showModule = true,
  headingLevel = 3,
}: ThreadRowProps) {
  const { getModule } = useModules();
  const Heading = `h${headingLevel}` as const;
  // A picture that can't load (removed, or hidden with its post) leaves no broken thumbnail behind.
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thread.image && !thumbFailed ? mediaSrc(thread.image.src) : null;
  const hidden = thread.status === 'hidden';
  // A deleted thread stays listed (without its text) while it has replies; neither it nor a hidden one takes votes.
  const deleted = thread.status === 'deleted';
  const at = time === 'activity' ? thread.lastActivityAt : thread.createdAt;
  const searching = Boolean(terms?.length);
  return (
    <li
      className={cx(
        'forum-row',
        thread.pinned && 'is-pinned',
        thread.unread && 'is-unread',
        thumb && 'has-image',
        hidden && 'is-hidden',
        deleted && 'is-deleted',
      )}
      data-hub="thread-row"
      data-thread-id={thread.id}
    >
      <div className="forum-row__main">
        <Heading className="forum-row__title" dir="auto">
          {thread.pinned ? <Icon glyph={glyph.pin} className="forum-row__pin" /> : null}
          <Link to={`/forum/${thread.slug}`} className="forum-row__link">
            <HighlightedText text={thread.title} terms={terms} />
            {thread.unread ? <span className="visually-hidden"> (new activity)</span> : null}
          </Link>
          {thread.pinned ? (
            <Badge tone="cobalt" size="sm">
              Pinned
            </Badge>
          ) : null}
          {!thread.pinned && !thread.unread && !hidden && !deleted && isNew(thread.createdAt) ? (
            <Badge tone="highlight" size="sm">
              New
            </Badge>
          ) : null}
          {thread.locked ? (
            <Badge tone="neutral" size="sm" icon={<Icon glyph={glyph.lock} />}>
              Locked
            </Badge>
          ) : null}
          {hidden ? (
            <Badge tone="alert" size="sm" icon={<Icon glyph={glyph.eyeOff} />}>
              Hidden
            </Badge>
          ) : null}
          {deleted ? (
            <Badge tone="outline" size="sm">
              Deleted
            </Badge>
          ) : null}
        </Heading>
        {searching && thread.excerpt ? (
          <p className="forum-row__excerpt" dir="auto">
            <HighlightedText text={thread.excerpt} terms={terms} />
          </p>
        ) : null}
        <div className="forum-row__meta">
          {showModule ? <ModuleChip module={getModule(thread.moduleId)} /> : null}
          <PlaceBadge thread={thread} chip />
          <TagBadges tags={thread.tags} max={1} />
          <span className="forum-row__by">
            {time === 'activity' && thread.isMine ? (
              'You started it'
            ) : (
              <>
                <AuthorAvatar author={thread.author} guest={unnamed(thread)} size="xs" />
                <span className="forum-row__author">{postAuthorName(thread)}</span>
                <AuthorFlair author={thread.author} />
              </>
            )}
            <span aria-hidden="true">·</span>
            <time className="forum-row__time" dateTime={at}>
              {time === 'activity' ? `active ${timeAgo(at)}` : timeAgo(at)}
            </time>
          </span>
        </div>
        {thread.unread ? (
          <p className="forum-row__news" aria-hidden="true">
            <span className="forum-row__dot" />
            New activity
          </p>
        ) : null}
      </div>
      {thumb ? (
        // The post has a picture (a photo of a question, say): a small thumbnail of it. The stretched title link covers it.
        <div className="forum-row__thumb" data-hub="thread-thumb">
          <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setThumbFailed(true)} />
          <span className="visually-hidden">Includes an image</span>
        </div>
      ) : null}
      <div className="forum-row__foot">
        <div className="forum-row__counts">
          <ReplyCount count={thread.replyCount} />
          <VoteButton
            count={thread.voteCount}
            voted={thread.voted}
            onToggle={() => onVote?.(thread)}
            disabled={hidden || deleted}
            quiet
          />
          {thumb ? <Icon glyph={glyph.image} className="forum-row__picture" /> : null}
        </div>
        {thread.answered ? <AnsweredBadge /> : null}
      </div>
    </li>
  );
}

/** Placeholder cards while a list loads (same shape as a row, so nothing jumps). */
export function ThreadRowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <ul role="list" className="forum-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="forum-row forum-row--skeleton">
          <div className="forum-row__main">
            <Skeleton width={i % 2 ? '72%' : '58%'} height="1.1em" />
            <Skeleton width="40%" height="0.8em" style={{ marginTop: 12 }} />
          </div>
          <div className="forum-row__foot">
            <div className="forum-row__counts">
              <Skeleton width={88} height={24} radius="var(--r-pill)" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
