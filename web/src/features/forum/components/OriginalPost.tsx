import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockSimpleOpen, PushPinSlash } from '@phosphor-icons/react';
import type { ThreadDetail } from '../../../api/types';
import { useAuth } from '../../../auth';
import { Badge, Button, CohortBadge, Icon, Panel, glyph, timeAgo } from '../../../ui';
import { BREAKPOINTS, useMediaQuery, useToast } from '../../../state';
import { useReport } from '../useReport';
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
 * The question: byline, text (or the edit form), and its actions: vote, reply, follow, copy link, report, and a menu
 * for its author (edit, delete) and for the reps (pin, lock, hide with a reason).
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
  // A flair (shown as a pill next to the name) replaces the year.
  const flair = roleFlair(thread.author);

  // Phones: Copy link goes in the menu, so the actions keep to one line.
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const report = useReport('thread', thread.id);
  const reportable = report && !thread.isMine && thread.status === 'visible';

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
      <header className="forum-byline">
        <AuthorAvatar author={thread.author} guest={unnamed(thread)} size="md" />
        <span className="forum-byline__text">
          <span className="forum-byline__who">
            <span className="forum-byline__name">{postAuthorName(thread)}</span>
            {flair ? <AuthorFlair author={thread.author} /> : year ? <CohortBadge year={year} size="sm" /> : null}
            <Badge tone="outline" size="sm">
              Author
            </Badge>
          </span>
          <span className="forum-byline__meta">
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
      <div className="forum-op__main">{body}</div>
      {!editing ? (
        <footer className="forum-op__actions">
          <VoteButton
            count={thread.voteCount}
            voted={thread.voted}
            onToggle={toggleVote}
            disabled={deleted || hidden || unavailable}
          />
          {readOnly ? null : (
            <>
              {takesReplies(thread) && mayTry('forum.post') ? (
                <Button variant="ghost" size="sm" leadingIcon={<Icon glyph={glyph.reply} />} onClick={onReply}>
                  Reply
                </Button>
              ) : null}
              <FollowButton thread={thread} />
              {phone ? null : (
                <Button variant="ghost" size="sm" leadingIcon={<Icon glyph={glyph.link} />} onClick={onCopyLink}>
                  Copy link
                </Button>
              )}
              <span className="forum-op__end">
                <PostMenu
                  label="More actions for this thread"
                  groups={[
                    [
                      phone && {
                        id: 'copy',
                        label: 'Copy link',
                        icon: <Icon glyph={glyph.link} />,
                        onSelect: onCopyLink,
                      },
                    ],
                    [
                      actions.edit && {
                        id: 'edit',
                        label: 'Edit',
                        icon: <Icon glyph={glyph.edit} />,
                        onSelect: () => setEditing(true),
                      },
                      actions.remove && {
                        id: 'delete',
                        label: 'Delete',
                        icon: <Icon glyph={glyph.trash} />,
                        danger: true,
                        onSelect: () => setConfirmDelete(true),
                      },
                      reportable && {
                        id: 'report',
                        label: report.label,
                        icon: <Icon glyph={glyph.flag} />,
                        onSelect: report.open,
                      },
                    ],
                    thread.canModerate
                      ? [
                          { heading: 'Moderate' },
                          thread.pinned
                            ? { id: 'unpin', label: 'Unpin', icon: PushPinSlash, onSelect: () => moderation.pin(false) }
                            : {
                                id: 'pin',
                                label: 'Pin to the top',
                                icon: <Icon glyph={glyph.pin} />,
                                onSelect: () => moderation.pin(true),
                              },
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
                                icon: <Icon glyph={glyph.lock} />,
                                onSelect: () => moderation.lock(true),
                              },
                          hidden
                            ? {
                                id: 'unhide',
                                label: gone ? 'Unhide as deleted' : 'Unhide thread',
                                icon: <Icon glyph={glyph.eye} />,
                                onSelect: moderation.unhide,
                              }
                            : {
                                id: 'hide',
                                label: 'Hide thread',
                                icon: <Icon glyph={glyph.eyeOff} />,
                                danger: true,
                                onSelect: () => setHiding(true),
                              },
                        ]
                      : [],
                  ]}
                />
              </span>
            </>
          )}
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

      {reportable ? report.dialog : null}
      <DeleteThreadDialog thread={thread} open={confirmDelete} onClose={() => setConfirmDelete(false)} />
    </Panel>
  );
}
