import { Link } from 'react-router-dom';
import { PushPin } from '@phosphor-icons/react';
import { Badge, Highlight, cx, timeAgo } from '../../../ui';
import { authorLabel, getAuthor } from '../data/authors.js';
import { AuthorAvatar } from './AuthorAvatar.jsx';
import { VoteButton } from './VoteButton.jsx';
import { HighlightedText, ModuleTag, PlaceBadge, ReplyCount, TagBadges } from './ThreadBits.jsx';

/**
 * One dense thread row: vote gutter, title + excerpt + meta, reply count + time.
 * The whole row is clickable (stretched title link); the vote button sits above it.
 * @param fresh  just posted by the student: slides in and the title gets a highlighter swipe
 * @param terms  search terms to mark in the title
 */
export function ThreadRow({ thread, onVote, fresh = false, terms, showModule = true, headingLevel = 3 }) {
  const author = getAuthor(thread.authorId, thread.authorYear);
  const Heading = `h${headingLevel}`;
  return (
    <li
      className={cx('forum-row', thread.pinned && 'is-pinned', fresh && 'is-fresh')}
      data-hub="thread-row"
      data-thread-id={thread.id}
    >
      <div className="forum-row__vote">
        <VoteButton count={thread.votes} voted={thread.voted} onToggle={() => onVote?.(thread.id)} />
      </div>
      <div className="forum-row__main">
        <Heading className="forum-row__title">
          {thread.pinned ? <PushPin weight="fill" className="forum-row__pin" aria-hidden="true" /> : null}
          <Link to={`/forum/${thread.id}`} className="forum-row__link">
            {fresh ? (
              <Highlight animate delay={220}>{thread.title}</Highlight>
            ) : (
              <HighlightedText text={thread.title} terms={terms} />
            )}
          </Link>
          {thread.pinned ? <Badge tone="cobalt" size="sm">Pinned</Badge> : null}
          {thread.isNew && !thread.pinned ? <Badge tone="highlight" size="sm">New</Badge> : null}
        </Heading>
        {thread.excerpt ? (
          <p className="forum-row__excerpt">
            <HighlightedText text={thread.excerpt} terms={terms} />
          </p>
        ) : null}
        <div className="forum-row__meta">
          <span className="forum-row__author">
            <AuthorAvatar author={author} size="xs" />
            {authorLabel(author)}
          </span>
          <PlaceBadge thread={thread} />
          {showModule ? <ModuleTag module={thread.module} /> : null}
          <TagBadges tags={thread.tags} />
        </div>
      </div>
      <div className="forum-row__stats">
        <ReplyCount count={thread.replyCount} answered={thread.answered} />
        <time className="forum-row__time" dateTime={new Date(thread.createdAt).toISOString()}>
          {timeAgo(thread.createdAt)}
        </time>
      </div>
    </li>
  );
}
