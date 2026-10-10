import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeSlash, LockSimple, PushPin } from '@phosphor-icons/react';
import type { ThreadSummary } from '../../../api/types';
import { Badge, Highlight, Skeleton, cx, timeAgo } from '../../../ui';
import { useModules } from '../../../state/modules';
import { authorName } from '../lib/authors';
import { mediaSrc } from '../lib/links';
import { isNew } from '../lib/time';
import { AuthorAvatar } from './AuthorAvatar';
import { VoteButton } from './VoteButton';
import { AuthorFlair, HighlightedText, ModuleTag, PlaceBadge, ReplyCount, TagBadges } from './ThreadBits';

export interface ThreadRowProps {
  thread: ThreadSummary;
  onVote?: (thread: ThreadSummary) => void;
  /** just posted by this student: slides in and the title gets a highlighter swipe */
  fresh?: boolean;
  /** search terms to mark in the title and excerpt */
  terms?: string[];
  showModule?: boolean;
  headingLevel?: 2 | 3 | 4;
}

/**
 * One dense thread row: vote gutter, title + excerpt + meta, a thumbnail when the post has a picture, reply count + time.
 * The whole row is clickable (stretched title link); the vote button sits above it.
 * Titles and excerpts are dir="auto": an Arabic title sits right-aligned, an English one stays left-aligned
 * (the vote, author, badges and counts around them stay left-to-right).
 */
export function ThreadRow({ thread, onVote, fresh = false, terms, showModule = true, headingLevel = 3 }: ThreadRowProps) {
  const { getModule } = useModules();
  const Heading = `h${headingLevel}` as const;
  // A picture that can't load (removed, or hidden with its post) leaves no broken thumbnail behind.
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thread.image && !thumbFailed ? mediaSrc(thread.image.src) : null;
  const hidden = thread.status === 'hidden';
  // A deleted thread stays listed (without its text) while it has replies; neither it nor a hidden one takes votes.
  const deleted = thread.status === 'deleted';
  return (
    <li
      className={cx('forum-row', thread.pinned && 'is-pinned', fresh && 'is-fresh', thumb && 'has-image', hidden && 'is-hidden', deleted && 'is-deleted')}
      data-hub="thread-row"
      data-thread-id={thread.id}
    >
      <div className="forum-row__vote">
        <VoteButton count={thread.voteCount} voted={thread.voted} onToggle={() => onVote?.(thread)} disabled={hidden || deleted} />
      </div>
      <div className="forum-row__main">
        <Heading className="forum-row__title" dir="auto">
          {thread.pinned ? <PushPin weight="fill" className="forum-row__pin" aria-hidden="true" /> : null}
          <Link to={`/forum/${thread.slug}`} className="forum-row__link">
            {fresh ? (
              <Highlight animate delay={220}>
                {thread.title}
              </Highlight>
            ) : (
              <HighlightedText text={thread.title} terms={terms} />
            )}
          </Link>
          {thread.pinned ? (
            <Badge tone="cobalt" size="sm">
              Pinned
            </Badge>
          ) : null}
          {!thread.pinned && isNew(thread.createdAt) ? (
            <Badge tone="highlight" size="sm">
              New
            </Badge>
          ) : null}
          {thread.locked ? (
            <Badge tone="neutral" size="sm" icon={LockSimple}>
              Locked
            </Badge>
          ) : null}
          {hidden ? (
            <Badge tone="alert" size="sm" icon={EyeSlash}>
              Hidden
            </Badge>
          ) : null}
          {deleted ? (
            <Badge tone="outline" size="sm">
              Deleted
            </Badge>
          ) : null}
        </Heading>
        {thread.excerpt ? (
          <p className="forum-row__excerpt" dir="auto">
            <HighlightedText text={thread.excerpt} terms={terms} />
          </p>
        ) : null}
        <div className="forum-row__meta">
          <span className="forum-row__author">
            <AuthorAvatar author={thread.author} size="xs" />
            {authorName(thread.author)}
            <AuthorFlair author={thread.author} />
          </span>
          <PlaceBadge thread={thread} />
          {showModule ? <ModuleTag module={getModule(thread.moduleId)} /> : null}
          <TagBadges tags={thread.tags} />
        </div>
      </div>
      {thumb ? (
        // The post has a picture (a photo of a question, say): a small thumbnail of it. The stretched title link covers it.
        <div className="forum-row__thumb" data-hub="thread-thumb">
          <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setThumbFailed(true)} />
          <span className="visually-hidden">Includes an image</span>
        </div>
      ) : null}
      <div className="forum-row__stats">
        <ReplyCount count={thread.replyCount} answered={thread.answered} />
        <time className="forum-row__time" dateTime={thread.createdAt}>
          {timeAgo(thread.createdAt)}
        </time>
      </div>
    </li>
  );
}

/** Placeholder rows while a list loads (same grid as a row, so nothing jumps). */
export function ThreadRowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <ul role="list" className="forum-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="forum-row forum-row--skeleton">
          <div className="forum-row__vote">
            <Skeleton width={48} height={56} radius="var(--r-control)" />
          </div>
          <div className="forum-row__main">
            <Skeleton width={i % 2 ? '72%' : '58%'} height="1.1em" />
            <Skeleton width="88%" height="0.9em" style={{ marginTop: 10 }} />
            <Skeleton width="40%" height="0.8em" style={{ marginTop: 12 }} />
          </div>
          <div className="forum-row__stats">
            <Skeleton width={44} height={24} radius="var(--r-pill)" />
          </div>
        </li>
      ))}
    </ul>
  );
}
