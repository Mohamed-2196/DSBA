import { useState, type ReactNode } from 'react';
import { ArrowBendUpLeft, CheckCircle, Eye, EyeSlash, PencilSimple, Trash } from '@phosphor-icons/react';
import type { Reply, ThreadDetail } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { Badge, Button, CohortBadge, ConfirmDialog, cx, timeAgo } from '../../../ui';
import { useToast } from '../../../state';
import { ReportButton } from '../ReportButton';
import { useAcceptAnswer, useDeleteReply, useModerateReply, useReplyVote } from '../api';
import { authorName, postYear, roleFlair, sameAuthor } from '../lib/authors';
import { readOnlyFor, textDeleted } from '../lib/replies';
import { AuthorAvatar } from './AuthorAvatar';
import { HideDialog } from './HideDialog';
import { PostMenu } from './PostMenu';
import { Prose } from './Prose';
import { ReplyEditForm } from './ReplyEditForm';
import { AuthorFlair } from './ThreadBits';
import { VoteButton } from './VoteButton';

export interface ReplyItemProps {
  reply: Reply;
  thread: ThreadDetail;
  nested?: boolean;
  /** replies sit under this one (deleting it leaves them under a "Deleted reply" note) */
  hasReplies?: boolean;
  /** arrived while the page was open: animates in with a "New" mark */
  fresh?: boolean;
  /** the reply a link pointed at (#reply-<id>): briefly marked */
  targeted?: boolean;
  /** start a reply to this one (absent when the thread takes no replies) */
  onReply?: (reply: Reply) => void;
  /** nested replies and the inline composer, under a top-level reply */
  children?: ReactNode;
}

/**
 * One reply: byline, body, vote / reply / accept actions, report, and a menu for its author (edit, delete) and for
 * moderators (hide, with a reason for the author). A deleted reply keeps its place, so the replies under it still make
 * sense. A hidden reply shows to moderators and to its own author, marked (decision D3).
 * The body is right-to-left or left-to-right per paragraph (see Prose), so an Arabic reply sits right-aligned.
 */
export function ReplyItem({ reply, thread, nested = false, hasReplies = false, fresh = false, targeted = false, onReply, children }: ReplyItemProps) {
  const { requireAuth } = useAuth();
  const { push } = useToast();
  const vote = useReplyVote();
  const accept = useAcceptAnswer();
  const remove = useDeleteReply();
  const moderate = useModerateReply();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hiding, setHiding] = useState(false);

  const mod = thread.canModerate;
  const deleted = reply.status === 'deleted';
  const hidden = reply.status === 'hidden';
  // Hidden with its text deleted (SEC-15): unhiding brings it back deleted.
  const gone = textDeleted(reply, mod);
  const accepted = reply.accepted || thread.acceptedReplyId === reply.id;
  const isOp = sameAuthor(reply.author, thread.author);
  const name = authorName(reply.author);
  const year = postYear(reply.authorYear, reply.author);
  // The thread's author (or a moderator) accepts a top-level reply by someone else.
  const canAccept = thread.canAccept && !nested && !deleted && !hidden && !isOp;
  // Your own reply, hidden by a rep: you still see it, marked, and nothing on it can change.
  const hiddenFromOthers = hidden && !mod;
  // A hidden thread is only in front of the reps and its author: no votes or reports there.
  const threadHidden = thread.status === 'hidden';
  const canReport = !reply.isMine && reply.status === 'visible' && !threadHidden;
  // The author of a hidden thread reads it with nothing they can change, their own replies in it included (the API
  // turns every write there down).
  const canChange = reply.canEdit && !readOnlyFor(thread);

  const toggleVote = () => {
    const up = !reply.voted;
    if (!requireAuth('Sign in to vote', () => vote.mutate({ replyId: reply.id, up: true }))) return;
    vote.mutate({ replyId: reply.id, up });
  };

  const toggleAccept = () => {
    accept.mutate(
      { threadId: thread.id, replyId: accepted ? null : reply.id },
      {
        onSuccess: () =>
          push(
            accepted
              ? { title: 'Answer unmarked', body: 'The thread is open for a better answer.', tone: 'info' }
              : { title: 'Answer accepted', body: 'It now sits at the top, so the next person finds it.', tone: 'success' },
          ),
        onError: (e) => push({ title: "That didn't work", body: errorMessage(e), tone: 'alert' }),
      },
    );
  };

  const hide = (reason: string | null) => {
    moderate.mutate(
      { replyId: reply.id, change: { status: 'hidden', reason } },
      {
        onSuccess: () => {
          setHiding(false);
          push({ title: 'Reply hidden', body: 'Only student reps can see it now. Resolve the report in Moderation if there is one.', tone: 'success' });
        },
      },
    );
  };

  const unhide = () => {
    moderate.mutate(
      { replyId: reply.id, change: { status: 'visible' } },
      {
        onSuccess: (r) =>
          push(
            r.status === 'deleted'
              ? { title: 'Reply shown as deleted', body: 'Its text was deleted while it was hidden, so it keeps its place without it.', tone: 'info' }
              : { title: 'Reply visible again', tone: 'success' },
          ),
        onError: (e) => push({ title: "That didn't work", body: errorMessage(e), tone: 'alert' }),
      },
    );
  };

  return (
    <article
      className={cx('forum-reply', nested && 'is-nested', accepted && 'is-accepted', fresh && 'is-fresh', targeted && 'is-target', hidden && 'is-hidden', deleted && 'is-deleted')}
      data-hub="reply"
      data-reply-id={reply.id}
      id={`reply-${reply.id}`}
      aria-label={deleted ? 'Deleted reply' : `${accepted ? 'Accepted answer' : hidden ? 'Hidden reply' : 'Reply'} by ${name}`}
    >
      <AuthorAvatar author={deleted ? null : reply.author} size={nested ? 'sm' : 'md'} className="forum-reply__avatar" />
      <div className="forum-reply__main">
        <header className="forum-reply__head">
          {deleted ? (
            <span className="forum-reply__name is-muted">Deleted reply</span>
          ) : (
            <>
              <span className="forum-reply__name">{name}</span>
              {roleFlair(reply.author) ? (
                <AuthorFlair author={reply.author} className="forum-reply__flair" />
              ) : year ? (
                <CohortBadge year={year} variant="dot" size="sm" className="forum-reply__cohort" />
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
          {hidden ? (
            <Badge tone="alert" size="sm" icon={EyeSlash}>
              Hidden
            </Badge>
          ) : null}
          {accepted ? (
            <span className="forum-reply__accepted">
              <CheckCircle weight="fill" aria-hidden="true" />
              Accepted answer
            </span>
          ) : null}
        </header>

        {hiddenFromOthers ? (
          <p className="forum-reply__note" role="note">
            A student rep hid your reply. Only you and the student reps can see it.
          </p>
        ) : null}

        {deleted ? (
          <p className="forum-reply__gone">This reply was deleted.</p>
        ) : gone ? (
          <p className="forum-reply__gone">Its text was deleted while it was hidden. Unhiding it brings it back as a deleted reply.</p>
        ) : editing ? (
          <ReplyEditForm reply={reply} onDone={() => setEditing(false)} />
        ) : (
          <Prose text={reply.body} className="forum-reply__body" />
        )}

        {!deleted && !editing && !hiddenFromOthers ? (
          <footer className="forum-reply__actions">
            {gone ? null : <VoteButton layout="inline" count={reply.voteCount} voted={reply.voted} onToggle={toggleVote} disabled={hidden || threadHidden} />}
            {onReply && !hidden ? (
              <Button variant="ghost" size="sm" leadingIcon={ArrowBendUpLeft} onClick={() => onReply(reply)}>
                Reply
              </Button>
            ) : null}
            {hidden && mod ? (
              <Button variant="ghost" size="sm" leadingIcon={Eye} onClick={unhide} loading={moderate.isPending}>
                Unhide
              </Button>
            ) : null}
            {canAccept ? (
              <Button variant="ghost" size="sm" leadingIcon={CheckCircle} onClick={toggleAccept} loading={accept.isPending} aria-pressed={accepted}>
                {accepted ? 'Accepted' : 'Accept answer'}
              </Button>
            ) : null}
            <span className="forum-reply__end">
              {canReport ? <ReportButton targetType="reply" targetId={reply.id} /> : null}
              <PostMenu
                label="More actions for this reply"
                groups={[
                  [
                    canChange && { id: 'edit', label: 'Edit', icon: PencilSimple, onSelect: () => setEditing(true) },
                    canChange && { id: 'delete', label: 'Delete', icon: Trash, danger: true, onSelect: () => setConfirmDelete(true) },
                  ],
                  [
                    mod &&
                      (hidden
                        ? { id: 'unhide', label: gone ? 'Unhide as deleted' : 'Unhide reply', icon: Eye, onSelect: unhide }
                        : { id: 'hide', label: 'Hide reply', icon: EyeSlash, onSelect: () => setHiding(true) }),
                  ],
                ]}
              />
            </span>
          </footer>
        ) : null}
        {children}
      </div>

      <HideDialog
        open={hiding}
        what="reply"
        author={reply.author}
        busy={moderate.isPending}
        error={hiding && moderate.isError ? errorMessage(moderate.error, "The reply wasn't hidden. Try again.") : null}
        onConfirm={hide}
        onClose={() => {
          setHiding(false);
          moderate.reset();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this reply?"
        body={
          hidden ? (
            <p>Its text is deleted for good. The reply stays hidden; if you unhide it later, it comes back as a deleted reply.</p>
          ) : (
            <p>
              Its text is deleted for everyone.{hasReplies ? ' The replies to it stay, under a “Deleted reply” note.' : ''} This can’t be undone.
            </p>
          )
        }
        confirmLabel="Delete reply"
        busy={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, "The reply wasn't deleted. Try again.") : null}
        onClose={() => {
          setConfirmDelete(false);
          remove.reset();
        }}
        onConfirm={() =>
          remove.mutate(
            { replyId: reply.id },
            {
              onSuccess: () => {
                setConfirmDelete(false);
                push({ title: 'Reply deleted', tone: 'success' });
              },
            },
          )
        }
      />
    </article>
  );
}
