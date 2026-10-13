import { useState, type ReactNode } from 'react';
import { ArrowBendUpLeft, CheckCircle, Eye, EyeSlash, PencilSimple, Trash } from '@phosphor-icons/react';
import type { Reply, ThreadDetail } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { Button, cx } from '../../../ui';
import { useToast } from '../../../state';
import { ReportButton } from '../ReportButton';
import { useAcceptAnswer, useReplyVote } from '../api';
import { authorName, sameAuthor } from '../lib/authors';
import { readOnlyFor, textDeleted } from '../lib/replies';
import { useReplyModeration } from '../lib/useReplyModeration';
import { AuthorAvatar } from './AuthorAvatar';
import { DeleteReplyDialog } from './DeleteDialogs';
import { HideDialog } from './HideDialog';
import { PostMenu } from './PostMenu';
import { Prose } from './Prose';
import { ReplyByline } from './ReplyByline';
import { ReplyEditForm } from './ReplyEditForm';
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
  /** nothing can change here (the thread was hidden or deleted after the page loaded) */
  readOnly?: boolean;
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
export function ReplyItem({ reply, thread, nested = false, hasReplies = false, fresh = false, targeted = false, readOnly = false, onReply, children }: ReplyItemProps) {
  const { requireAuth, mayTry } = useAuth();
  const { push } = useToast();
  const vote = useReplyVote();
  const accept = useAcceptAnswer();
  const moderation = useReplyModeration(reply);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hiding, setHiding] = useState(false);

  const deleted = reply.status === 'deleted';
  const hidden = reply.status === 'hidden';
  // Hidden with its text deleted (SEC-15): unhiding brings it back deleted.
  const gone = textDeleted(reply, thread.canModerate);
  const accepted = reply.accepted || thread.acceptedReplyId === reply.id;
  const isOp = sameAuthor(reply.author, thread.author);
  // Your own reply, hidden by a rep: you still see it, marked, and nothing on it can change.
  const hiddenFromOthers = hidden && !thread.canModerate;
  // A hidden thread is only in front of the reps and its author: no votes or reports there.
  const threadHidden = thread.status === 'hidden';
  // The author of a hidden thread reads it with nothing they can change, their own replies in it included (the API
  // turns every write there down); and so does everyone once the thread has gone from under the page.
  const frozen = readOnly || readOnlyFor(thread);
  const moderates = thread.canModerate && !readOnly;
  const canChange = reply.canEdit && !frozen;
  const canReport = !reply.isMine && reply.status === 'visible' && !threadHidden && !readOnly;
  // The thread's author (or a moderator) accepts a top-level reply by someone else, with the forum.post box.
  const canAccept = thread.canAccept && mayTry('forum.post') && !readOnly && !nested && !deleted && !hidden && !isOp;

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

  return (
    <article
      className={cx('forum-reply', nested && 'is-nested', accepted && 'is-accepted', fresh && 'is-fresh', targeted && 'is-target', hidden && 'is-hidden', deleted && 'is-deleted')}
      data-hub="reply"
      data-reply-id={reply.id}
      id={`reply-${reply.id}`}
      aria-label={deleted ? 'Deleted reply' : `${accepted ? 'Accepted answer' : hidden ? 'Hidden reply' : 'Reply'} by ${authorName(reply.author)}`}
    >
      <AuthorAvatar author={deleted ? null : reply.author} size={nested ? 'sm' : 'md'} className="forum-reply__avatar" />
      <div className="forum-reply__main">
        <ReplyByline reply={reply} isOp={isOp} accepted={accepted} fresh={fresh} gone={gone} />

        {hiddenFromOthers ? (
          <p className="forum-reply__note" role="note">
            A student rep hid your reply. Only you and the student reps can see it. If they gave a reason, it’s in your notifications.
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
            {gone ? null : <VoteButton layout="inline" count={reply.voteCount} voted={reply.voted} onToggle={toggleVote} disabled={hidden || threadHidden || readOnly} />}
            {onReply && !hidden ? (
              <Button variant="ghost" size="sm" leadingIcon={ArrowBendUpLeft} onClick={() => onReply(reply)}>
                Reply
              </Button>
            ) : null}
            {hidden && moderates ? (
              <Button variant="ghost" size="sm" leadingIcon={Eye} onClick={moderation.unhide} loading={moderation.pending}>
                {gone ? 'Unhide as deleted' : 'Unhide'}
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
                    moderates &&
                      (hidden
                        ? { id: 'unhide', label: gone ? 'Unhide as deleted' : 'Unhide reply', icon: Eye, onSelect: moderation.unhide }
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
        busy={moderation.pending}
        error={hiding ? moderation.hideError : null}
        onConfirm={(reason) => moderation.hide(reason, () => setHiding(false))}
        onClose={() => {
          setHiding(false);
          moderation.reset();
        }}
      />
      <DeleteReplyDialog reply={reply} hasReplies={hasReplies} open={confirmDelete} onClose={() => setConfirmDelete(false)} />
    </article>
  );
}
