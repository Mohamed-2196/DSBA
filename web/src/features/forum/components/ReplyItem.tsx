import { useState, type ReactNode } from 'react';
import { ArrowBendUpLeft, CheckCircle, Eye, EyeSlash, PencilSimple, Trash } from '@phosphor-icons/react';
import type { Reply, ThreadDetail } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { Badge, Button, CohortBadge, cx, timeAgo } from '../../../ui';
import { useToast } from '../../../state';
import { ReportButton } from '../ReportButton';
import { useAcceptAnswer, useDeleteReply, useModerateReply, useReplyVote, useUpdateReply } from '../api';
import { authorName, postYear, roleFlair, sameAuthor } from '../lib/authors';
import { AuthorAvatar } from './AuthorAvatar';
import { ConfirmDialog } from './ConfirmDialog';
import { MarkdownEditor } from './MarkdownEditor';
import { PostMenu } from './PostMenu';
import { Prose } from './Prose';
import { AuthorFlair } from './ThreadBits';
import { VoteButton } from './VoteButton';

const REPLY_MAX = 10_000;

export interface ReplyItemProps {
  reply: Reply;
  thread: ThreadDetail;
  nested?: boolean;
  /** arrived while the page was open: animates in with a "New" mark */
  fresh?: boolean;
  /** the reply a link pointed at (#reply-<id>): briefly marked */
  targeted?: boolean;
  /** start a reply to this one (absent when the thread is locked) */
  onReply?: (reply: Reply) => void;
  /** nested replies and the inline composer, under a top-level reply */
  children?: ReactNode;
}

/**
 * One reply: byline, body, vote / reply / accept actions, report, and a menu for its author (edit, delete) and
 * for moderators (hide). A deleted reply keeps its place, so the replies under it still make sense.
 * The body is right-to-left or left-to-right per paragraph (see Prose), so an Arabic reply sits right-aligned.
 */
export function ReplyItem({ reply, thread, nested = false, fresh = false, targeted = false, onReply, children }: ReplyItemProps) {
  const { requireAuth } = useAuth();
  const { push } = useToast();
  const vote = useReplyVote();
  const accept = useAcceptAnswer();
  const update = useUpdateReply();
  const remove = useDeleteReply();
  const moderate = useModerateReply();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleted = reply.status === 'deleted';
  const hidden = reply.status === 'hidden';
  const accepted = reply.accepted || thread.acceptedReplyId === reply.id;
  const isOp = sameAuthor(reply.author, thread.author);
  const name = authorName(reply.author);
  const year = postYear(reply.authorYear, reply.author);
  // The thread's author (or a moderator) accepts a top-level reply by someone else.
  const canAccept = thread.canAccept && !nested && !deleted && !hidden && !isOp;

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

  const saveEdit = () => {
    const text = draft.trim();
    if (!text) {
      setEditError('A reply needs some text. To remove it, delete it instead.');
      return;
    }
    update.mutate(
      { replyId: reply.id, body: text },
      {
        onSuccess: () => {
          setEditing(false);
          setEditError(null);
        },
        onError: (e) => setEditError(errorMessage(e, "Your changes weren't saved. Try again.")),
      },
    );
  };

  const setVisibility = (status: 'visible' | 'hidden') => {
    moderate.mutate(
      { replyId: reply.id, status },
      {
        onSuccess: () =>
          push(
            status === 'hidden'
              ? { title: 'Reply hidden', body: 'Only student reps can see it now. Resolve the report in Moderation if there is one.', tone: 'success' }
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
      aria-label={deleted ? 'Deleted reply' : `${accepted ? 'Accepted answer' : 'Reply'} by ${name}`}
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
          {reply.editedAt && !deleted ? (
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

        {deleted ? (
          <p className="forum-reply__gone">This reply was deleted.</p>
        ) : editing ? (
          <div className="forum-edit">
            <MarkdownEditor
              label="Edit your reply"
              hideLabel
              value={draft}
              onChange={(v) => {
                setDraft(v);
                if (editError) setEditError(null);
              }}
              error={editError}
              rows={3}
              tools="basic"
              preview={false}
              autoFocus
              onSubmit={saveEdit}
              textareaProps={{ dir: 'auto', maxLength: REPLY_MAX }}
            />
            <div className="forum-edit__actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(reply.body);
                  setEditError(null);
                }}
                disabled={update.isPending}
              >
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={saveEdit} loading={update.isPending}>
                Save changes
              </Button>
            </div>
          </div>
        ) : (
          <Prose text={reply.body} className="forum-reply__body" />
        )}

        {!deleted && !editing ? (
          <footer className="forum-reply__actions">
            <VoteButton layout="inline" count={reply.voteCount} voted={reply.voted} onToggle={toggleVote} disabled={hidden} />
            {onReply && !hidden ? (
              <Button variant="ghost" size="sm" leadingIcon={ArrowBendUpLeft} onClick={() => onReply(reply)}>
                Reply
              </Button>
            ) : null}
            {hidden && thread.canModerate ? (
              <Button variant="ghost" size="sm" leadingIcon={Eye} onClick={() => setVisibility('visible')} loading={moderate.isPending}>
                Unhide
              </Button>
            ) : null}
            {canAccept ? (
              <Button variant="ghost" size="sm" leadingIcon={CheckCircle} onClick={toggleAccept} loading={accept.isPending} aria-pressed={accepted}>
                {accepted ? 'Accepted' : 'Accept answer'}
              </Button>
            ) : null}
            <span className="forum-reply__end">
              {!reply.isMine ? <ReportButton targetType="reply" targetId={reply.id} /> : null}
              <PostMenu
                label="More actions for this reply"
                groups={[
                  [
                    reply.canEdit && {
                      id: 'edit',
                      label: 'Edit',
                      icon: PencilSimple,
                      onSelect: () => {
                        setDraft(reply.body);
                        setEditing(true);
                      },
                    },
                    reply.canEdit && { id: 'delete', label: 'Delete', icon: Trash, danger: true, onSelect: () => setConfirmDelete(true) },
                  ],
                  [
                    thread.canModerate &&
                      (hidden
                        ? { id: 'unhide', label: 'Unhide reply', icon: Eye, onSelect: () => setVisibility('visible') }
                        : { id: 'hide', label: 'Hide reply', icon: EyeSlash, onSelect: () => setVisibility('hidden') }),
                  ],
                ]}
              />
            </span>
          </footer>
        ) : null}
        {children}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this reply?"
        body={
          <>
            Its text will be removed for everyone. {children ? 'Replies to it stay, under a "deleted" note.' : 'This can’t be undone.'}
          </>
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
