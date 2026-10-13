// What the thread page says about a thread that isn't open to everyone: hidden (to the reps, and to its author),
// deleted, locked, or gone while the page was open; a link to a reply that isn't there; and the reply composer when
// the thread takes replies and the person may post.
import { useState, type RefObject } from 'react';
import { ChatCircleText, Eye, EyeSlash, LockSimple, Prohibit, WarningCircle } from '@phosphor-icons/react';
import type { Reply, ThreadDetail } from '../../../api/types';
import { useAuth } from '../../../auth';
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

/** The thread went while the page was open (reading it again answered 404): what is on screen stays, read-only. */
export function UnavailableBanner() {
  return (
    <div className="forum-notice is-alert" role="status" data-hub="thread-unavailable">
      <WarningCircle aria-hidden="true" weight="bold" className="forum-notice__icon" />
      <span className="forum-notice__text">
        <strong>This thread isn’t available any more.</strong> It was hidden or deleted after you opened it. You can still read what’s on the
        page, but it can’t take replies.
      </span>
    </div>
  );
}

/** A link (a notification, a report) pointed at a reply that isn't in the thread: deleted, or hidden by a rep. */
export function MissingReplyNote() {
  return (
    <p className="forum-notice" role="note" data-hub="reply-missing">
      <ChatCircleText aria-hidden="true" weight="bold" className="forum-notice__icon" />
      <span className="forum-notice__text">The reply this link points to isn’t here any more. It may have been deleted or hidden.</span>
    </p>
  );
}

export interface ThreadComposeProps {
  thread: ThreadDetail;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onPosted: (reply: Reply) => void;
  /** the thread was hidden or deleted after the page loaded */
  unavailable?: boolean;
}

function whyClosed(thread: ThreadDetail, unavailable: boolean): string {
  if (unavailable) return 'This thread was hidden or deleted after you opened it, so new replies are off.';
  if (thread.status === 'deleted') return 'This thread was deleted, so new replies are off.';
  if (thread.status === 'hidden') {
    return thread.canModerate ? 'This thread is hidden, so new replies are off. Unhide it to let people reply.' : 'New replies are off while this thread is hidden.';
  }
  return 'This thread is locked, so new replies are off.';
}

/** Why an account can't post: suspended, or its roles don't include forum.post. */
export function CantPostNote({ suspended }: { suspended: boolean }) {
  return (
    <p className="forum-notice" role="note" data-hub="cant-post">
      <Prohibit aria-hidden="true" weight="bold" className="forum-notice__icon" />
      <span className="forum-notice__text">
        {suspended ? 'Your account is suspended, so you can’t post in the forum for now. Contact an admin.' : 'Posting in the forum isn’t on your account. If you think you need it, ask an admin.'}
      </span>
    </p>
  );
}

/**
 * Under the replies: the composer when the thread takes replies and the person may post, otherwise why not. A reply being written when
 * the thread closes (locked, hidden or deleted meanwhile) stays on screen, so its text can be copied.
 */
export function ThreadCompose({ thread, textareaRef, onPosted, unavailable = false }: ThreadComposeProps) {
  const open = takesReplies(thread) && !unavailable;
  const [unsent, setUnsent] = useState(false);
  const offer = useAuth().offer('forum.post');
  if (open && (offer === 'suspended' || offer === 'no')) return <CantPostNote suspended={offer === 'suspended'} />;
  if (!open && !unsent) {
    return (
      <p className="forum-notice" role="note">
        <LockSimple aria-hidden="true" weight="bold" className="forum-notice__icon" />
        <span className="forum-notice__text">{whyClosed(thread, unavailable)}</span>
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
          <LockSimple aria-hidden="true" weight="bold" /> {whyClosed(thread, unavailable)} Copy your reply if you want to keep it.
        </p>
      ) : null}
      <ReplyComposer thread={thread} textareaRef={textareaRef} onPosted={onPosted} onTextChange={setUnsent} closed={!open} />
    </section>
  );
}
