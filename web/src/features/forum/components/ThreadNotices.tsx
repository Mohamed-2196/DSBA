// What the thread page says about a thread that isn't open to everyone: hidden (to the reps, and to its author),
// deleted, or locked, and the reply composer when the thread takes replies.
import { useState, type RefObject } from 'react';
import { Eye, EyeSlash, LockSimple } from '@phosphor-icons/react';
import type { Reply, ThreadDetail } from '../../../api/types';
import { Button } from '../../../ui';
import { readOnlyFor, takesReplies, textDeleted } from '../lib/replies';
import { ReplyComposer } from './ReplyComposer';

export interface HiddenBannerProps {
  thread: ThreadDetail;
  /** reps: show the thread to everyone again */
  onUnhide: () => void;
  unhiding: boolean;
}

/** Above a hidden thread: for the reps, what it means and Unhide; for its author, that a rep hid it (decision D3). */
export function HiddenBanner({ thread, onUnhide, unhiding }: HiddenBannerProps) {
  if (thread.status !== 'hidden') return null;
  if (readOnlyFor(thread)) {
    return (
      <div className="forum-notice is-alert" role="note" data-hub="thread-hidden-note">
        <EyeSlash aria-hidden="true" weight="bold" className="forum-notice__icon" />
        <span className="forum-notice__text">
          <strong>A student rep hid this thread.</strong> Only you and the student reps can see it, and it can’t take replies or votes. If
          the rep gave a reason, it’s in your notifications. Contact a student rep if you think this is a mistake.
        </span>
      </div>
    );
  }
  const gone = textDeleted(thread, thread.canModerate);
  return (
    <div className="forum-notice is-alert" role="note">
      <EyeSlash aria-hidden="true" weight="bold" className="forum-notice__icon" />
      <span className="forum-notice__text">
        <strong>This thread is hidden.</strong>{' '}
        {gone
          ? 'Only student reps and admins can see it. Its text was deleted, so unhiding it brings it back as a deleted thread.'
          : 'Student reps, admins and its author can see it; nobody else.'}{' '}
        If it was reported, resolve the report in Moderation.
      </span>
      <Button size="sm" leadingIcon={Eye} loading={unhiding} onClick={onUnhide}>
        {gone ? 'Unhide as deleted' : 'Unhide'}
      </Button>
    </div>
  );
}

export interface ThreadComposeProps {
  thread: ThreadDetail;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onPosted: (reply: Reply) => void;
}

function whyClosed(thread: ThreadDetail): string {
  if (thread.status === 'deleted') return 'This thread was deleted, so new replies are off.';
  if (thread.status === 'hidden') {
    return thread.canModerate ? 'This thread is hidden, so new replies are off. Unhide it to let people reply.' : 'New replies are off while this thread is hidden.';
  }
  return 'This thread is locked, so new replies are off.';
}

/**
 * Under the replies: the composer when the thread takes replies, otherwise why it doesn't. A reply being written when
 * the thread closes (locked, hidden or deleted meanwhile) stays on screen, so its text can be copied.
 */
export function ThreadCompose({ thread, textareaRef, onPosted }: ThreadComposeProps) {
  const open = takesReplies(thread);
  const [unsent, setUnsent] = useState(false);
  if (!open && !unsent) {
    return (
      <p className="forum-notice" role="note">
        <LockSimple aria-hidden="true" weight="bold" className="forum-notice__icon" />
        <span className="forum-notice__text">{whyClosed(thread)}</span>
      </p>
    );
  }
  return (
    <section className="forum-thread__compose" aria-label="Reply to this thread">
      {open && thread.locked ? (
        <p className="forum-compose-note forum-compose-note--locked" role="note">
          <LockSimple aria-hidden="true" weight="bold" /> This thread is locked. As a student rep you can still reply; everyone else can’t.
        </p>
      ) : null}
      {!open ? (
        <p className="forum-compose-note forum-compose-note--locked" role="alert">
          <LockSimple aria-hidden="true" weight="bold" /> {whyClosed(thread)} Copy your reply if you want to keep it.
        </p>
      ) : null}
      <ReplyComposer thread={thread} textareaRef={textareaRef} onPosted={onPosted} onTextChange={setUnsent} closed={!open} />
    </section>
  );
}
