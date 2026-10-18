import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowBendUpLeft,
  Eye,
  EyeSlash,
  LinkSimple,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  PushPin,
  PushPinSlash,
  Trash,
} from '@phosphor-icons/react';
import type { ThreadDetail } from '../../../api/types';
import { useAuth } from '../../../auth';
import { Button, Panel, timeAgo } from '../../../ui';
import { useToast } from '../../../state';
import { ReportButton } from '../ReportButton';
import { useThreadVote } from '../api';
import { postAuthorName, postYear, roleFlair, unnamed } from '../lib/authors';
import { postMenuActions, readOnlyFor, takesReplies, textDeleted } from '../lib/replies';
import type { useThreadModeration } from '../lib/useThreadModeration';
import { FollowButton } from './FollowButton';
import { AuthorAvatar } from './AuthorAvatar';
import { DeleteThreadDialog } from './DeleteDialogs';
import { HideDialog } from './HideDialog';
import { PostMenu } from './PostMenu';
import { Prose } from './Prose';
import { AuthorFlair } from './ThreadBits';
import { ThreadEditForm } from './ThreadEditForm';
import { VoteButton } from './VoteButton';

export interface OriginalPostProps {
  thread: ThreadDetail;
  moderation: ReturnType<typeof useThreadModeration>;
  /** "Reply": go to the composer under the replies */
  onReply: () => void;
  onCopyLink: () => void;
  /** the thread was hidden or deleted after the page loaded: it stays on screen, with nothing to change */
  unavailable?: boolean;
}

/**
 * The question: vote, byline, text (or the edit form), and its actions: reply, copy link, report, and a menu for its
 * author (edit, delete) and for the reps (pin, lock, hide with a reason).
 */
export function OriginalPost({ thread, moderation, onReply, onCopyLink, unavailable = false }: OriginalPostProps) {
  const { requireAuth, mayTry } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const vote = useThreadVote();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hiding, setHiding] = useState(false);

  const deleted = thread.status === 'deleted';
  const hidden = thread.status === 'hidden';
  const gone = textDeleted(thread, thread.canModerate);
  const readOnly = readOnlyFor(thread) || unavailable;
  const actions = postMenuActions(thread.canEdit, thread.canModerate, mayTry('forum.post'));
  const year = postYear(thread.authorYear, thread.author);
  // What stands before 'posted' in the byline: a flair (shown as a pill next to the name) replaces the year.
  const byline = roleFlair(thread.author) ? null : year ? `Year ${year}` : null;

  const toggleVote = () => {
    const up = !thread.voted;
    if (!requireAuth('Sign in to vote', () => vote.mutate({ threadId: thread.id, up: true }))) return;
    vote.mutate({ threadId: thread.id, up });
  };

  const body = editing ? (
    <ThreadEditForm
      thread={thread}
      onDone={(updated) => {
        setEditing(false);
        if (updated) {
          push({ title: 'Thread updated', tone: 'success' });
          if (updated.slug !== thread.slug) navigate(`/forum/${updated.slug}`, { replace: true });
        }
      }}
    />
  ) : deleted ? (
    <p className="forum-op__gone">This post was deleted. The replies are still here.</p>
  ) : gone ? (
    <p className="forum-op__gone">Its text was deleted while it was hidden.</p>
  ) : thread.body ? (
    <Prose text={thread.body} className="forum-op__body" />
  ) : null;

  return (
    <Panel as="article" padding="none" className="forum-op" data-hub="thread-op" aria-label="Original post">
      <div className="forum-op__vote">
        <VoteButton
          size="lg"
          count={thread.voteCount}
          voted={thread.voted}
          onToggle={toggleVote}
          disabled={deleted || hidden || unavailable}
        />
      </div>
      <div className="forum-op__main">
        <header className="forum-byline">
          <AuthorAvatar author={thread.author} guest={unnamed(thread)} size="md" />
          <span className="forum-byline__text">
            <span className="forum-byline__who">
              <span className="forum-byline__name">{postAuthorName(thread)}</span>
              <AuthorFlair author={thread.author} />
            </span>
            <span className="forum-byline__meta">
              {byline ? `${byline}, posted` : 'Posted'}{' '}
              <time dateTime={thread.createdAt}>{timeAgo(thread.createdAt)}</time>
              {thread.editedAt && !gone ? (
                <span
                  className="forum-byline__edited"
                  title={`Edited ${new Date(thread.editedAt).toLocaleString('en-GB')}`}
                >
                  {' '}
                  · edited
                </span>
              ) : null}
            </span>
          </span>
        </header>
        {body}
      </div>
      {!editing && !readOnly ? (
        <footer className="forum-op__actions">
          {takesReplies(thread) && mayTry('forum.post') ? (
            <Button variant="secondary" size="sm" leadingIcon={ArrowBendUpLeft} onClick={onReply}>
              Reply
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" leadingIcon={LinkSimple} onClick={onCopyLink}>
            Copy link
          </Button>
          <FollowButton thread={thread} />
          <span className="forum-op__end">
            {!thread.isMine && thread.status === 'visible' ? (
              <ReportButton targetType="thread" targetId={thread.id} />
            ) : null}
            <PostMenu
              label="More actions for this thread"
              groups={[
                [
                  actions.edit && { id: 'edit', label: 'Edit', icon: PencilSimple, onSelect: () => setEditing(true) },
                  actions.remove && {
                    id: 'delete',
                    label: 'Delete',
                    icon: Trash,
                    danger: true,
                    onSelect: () => setConfirmDelete(true),
                  },
                ],
                thread.canModerate
                  ? [
                      { heading: 'Moderate' },
                      thread.pinned
                        ? { id: 'unpin', label: 'Unpin', icon: PushPinSlash, onSelect: () => moderation.pin(false) }
                        : { id: 'pin', label: 'Pin to the top', icon: PushPin, onSelect: () => moderation.pin(true) },
                      thread.locked
                        ? {
                            id: 'unlock',
                            label: 'Unlock replies',
                            icon: LockSimpleOpen,
                            onSelect: () => moderation.lock(false),
                          }
                        : {
                            id: 'lock',
                            label: 'Lock replies',
                            icon: LockSimple,
                            onSelect: () => moderation.lock(true),
                          },
                      hidden
                        ? {
                            id: 'unhide',
                            label: gone ? 'Unhide as deleted' : 'Unhide thread',
                            icon: Eye,
                            onSelect: moderation.unhide,
                          }
                        : {
                            id: 'hide',
                            label: 'Hide thread',
                            icon: EyeSlash,
                            danger: true,
                            onSelect: () => setHiding(true),
                          },
                    ]
                  : [],
              ]}
            />
          </span>
        </footer>
      ) : null}

      <HideDialog
        open={hiding}
        what="thread"
        author={thread.author}
        busy={moderation.pending}
        error={hiding ? moderation.hideError : null}
        onConfirm={(reason) => moderation.hide(reason, () => setHiding(false))}
        onClose={() => {
          setHiding(false);
          moderation.reset();
        }}
      />

      <DeleteThreadDialog thread={thread} open={confirmDelete} onClose={() => setConfirmDelete(false)} />
    </Panel>
  );
}
