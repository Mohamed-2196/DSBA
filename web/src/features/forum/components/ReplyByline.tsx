import type { Reply } from '../../../api/types';
import { Badge, CohortBadge, Icon, glyph, timeAgo } from '../../../ui';
import { postAuthorName, postYear, roleFlair } from '../lib/authors';
import { AnsweredBadge, AuthorFlair } from './ThreadBits';

export interface ReplyBylineProps {
  reply: Reply;
  /** written by the thread's author */
  isOp: boolean;
  accepted: boolean;
  /** arrived while the page was open */
  fresh: boolean;
  /** hidden, with its text deleted (SEC-15): no "edited" mark */
  gone: boolean;
}

/** Who wrote a reply and when, and what it is: the thread's author, new, hidden, the accepted answer. */
export function ReplyByline({ reply, isOp, accepted, fresh, gone }: ReplyBylineProps) {
  const deleted = reply.status === 'deleted';
  const year = postYear(reply.authorYear, reply.author);
  return (
    <header className="forum-reply__head">
      {deleted ? (
        <span className="forum-reply__name is-muted">Deleted reply</span>
      ) : (
        <>
          <span className="forum-reply__name">{postAuthorName(reply)}</span>
          {roleFlair(reply.author) ? (
            <AuthorFlair author={reply.author} className="forum-reply__flair" />
          ) : year ? (
            <CohortBadge year={year} size="sm" className="forum-reply__cohort" />
          ) : null}
          {isOp ? (
            <Badge tone="outline" size="sm">
              Author
            </Badge>
          ) : null}
        </>
      )}
      <time className="forum-reply__time" dateTime={reply.createdAt}>
        {timeAgo(reply.createdAt)}
      </time>
      {reply.editedAt && !deleted && !gone ? (
        <span className="forum-reply__edited" title={`Edited ${new Date(reply.editedAt).toLocaleString('en-GB')}`}>
          edited
        </span>
      ) : null}
      {fresh && !deleted ? (
        <Badge tone="highlight" size="sm">
          New
        </Badge>
      ) : null}
      {reply.status === 'hidden' ? (
        <Badge tone="alert" size="sm" icon={<Icon glyph={glyph.eyeOff} />}>
          Hidden
        </Badge>
      ) : null}
      {accepted ? (
        <span className="forum-reply__accepted">
          <AnsweredBadge label="Accepted answer" />
        </span>
      ) : null}
    </header>
  );
}
