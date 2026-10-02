import { ArrowBendUpLeft, CheckCircle } from '@phosphor-icons/react';
import { Badge, Button, CohortBadge, cx, timeAgo } from '../../../ui';
import { authorLabel, getAuthor } from '../data/authors.js';
import { AuthorAvatar } from './AuthorAvatar.jsx';
import { Prose } from './Prose.jsx';
import { VoteButton } from './VoteButton.jsx';

/**
 * One reply: byline, body, vote / reply / accept actions. Top-level replies render their
 * nested replies (one level) and the inline composer as `children`.
 */
export function ReplyItem({ reply, thread, fresh = false, nested = false, onVote, onReply, canAccept = false, onAccept, children }) {
  const author = getAuthor(reply.authorId, reply.authorYear);
  const accepted = reply.id === thread.acceptedId;
  const isOp = reply.authorId === thread.authorId;
  return (
    <article
      className={cx('forum-reply', nested && 'is-nested', accepted && 'is-accepted', fresh && 'is-fresh', reply.reveal && 'is-reveal')}
      data-hub="reply"
      data-reply-id={reply.id}
      aria-label={`${accepted ? 'Accepted answer' : 'Reply'} by ${authorLabel(author)}`}
    >
      <AuthorAvatar author={author} size={nested ? 'sm' : 'md'} className="forum-reply__avatar" />
      <div className="forum-reply__main">
        <header className="forum-reply__head">
          <span className="forum-reply__name">{authorLabel(author)}</span>
          {author.year ? <CohortBadge year={author.year} variant="dot" size="sm" className="forum-reply__cohort" /> : null}
          {isOp ? <Badge tone="outline" size="sm">Author</Badge> : null}
          <time className="forum-reply__time" dateTime={new Date(reply.createdAt).toISOString()}>
            {timeAgo(reply.createdAt)}
          </time>
          {fresh ? <Badge tone="highlight" size="sm">New</Badge> : null}
          {accepted ? (
            <span className="forum-reply__accepted">
              <CheckCircle weight="fill" aria-hidden="true" />
              Accepted answer
            </span>
          ) : null}
        </header>
        <Prose text={reply.body} className="forum-reply__body" />
        <footer className="forum-reply__actions">
          <VoteButton layout="inline" count={reply.votes} voted={reply.voted} onToggle={() => onVote?.(reply.id)} />
          {onReply ? (
            <Button variant="ghost" size="sm" leadingIcon={ArrowBendUpLeft} onClick={() => onReply(reply)}>
              Reply
            </Button>
          ) : null}
          {canAccept && !nested ? (
            <Button variant="ghost" size="sm" leadingIcon={CheckCircle} onClick={() => onAccept?.(reply)} aria-pressed={accepted}>
              {accepted ? 'Accepted' : 'Accept answer'}
            </Button>
          ) : null}
        </footer>
        {children}
      </div>
    </article>
  );
}
