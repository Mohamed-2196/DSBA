import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Reply, ThreadDetail } from '../../../api/types';
import { ApiError, errorMessage } from '../../../api/errors';
import { badgeOf, useAuth } from '../../../auth';
import { Button, Kbd, cx, modKeyLabel } from '../../../ui';
import { useCreateReply } from '../api';
import { authorName } from '../lib/authors';
import { REPLY_MAX } from '../lib/threadForm';
import { useAttachImages } from '../lib/useAttachImages';
import { AuthorAvatar } from './AuthorAvatar';
import { AttachmentList } from './ImageAttachments';
import { MarkdownEditor } from './MarkdownEditor';

export interface ReplyComposerProps {
  thread: ThreadDetail;
  /** reply inline under this reply (one level of nesting) */
  parent?: Reply | null;
  /** start the text with @name (replying to a nested reply) */
  mention?: string | null;
  onPosted?: (reply: Reply) => void;
  onCancel?: () => void;
  textareaRef?: RefObject<HTMLTextAreaElement>;
  autoFocus?: boolean;
  /** told whether there is text not posted yet (the page keeps the composer for it if the thread closes) */
  onTextChange?: (hasText: boolean) => void;
  /** the thread stopped taking replies while this was being written: the text stays, to be copied */
  closed?: boolean;
}

/**
 * The thread stopped taking replies after the page loaded: deleted or hidden (post_unavailable; or 404 for someone who
 * may no longer see it), or locked. Under a reply, a 404 means that reply went, not the thread.
 */
const isClosedRefusal = (e: unknown, inline: boolean) =>
  e instanceof ApiError && (e.code === 'post_unavailable' || e.code === 'thread_locked' || (e.status === 404 && !inline));

/**
 * Write a reply. At the bottom of a thread (data-hub="reply-composer", textarea "reply-input"), or inline under a reply
 * when `parent` is set (replies to a nested reply attach to its parent and mention the person).
 * Guests can write; posting asks them to sign in first and then posts what they wrote.
 */
export function ReplyComposer({ thread, parent = null, mention = null, onPosted, onCancel, textareaRef, autoFocus = false, onTextChange, closed = false }: ReplyComposerProps) {
  const { me, status, requireAuth } = useAuth();
  const create = useCreateReply();
  const [body, setBody] = useState(mention ? `@${mention} ` : '');
  const [error, setError] = useState<string | null>(null);
  // The API turned the reply down because the thread closed meanwhile: Post stays off until the page shows why, and
  // comes back if the thread opens again (a rep unlocks it).
  const [refused, setRefused] = useState(false);
  const [wasClosed, setWasClosed] = useState(closed);
  if (closed !== wasClosed) {
    setWasClosed(closed);
    if (!closed) setRefused(false);
  }
  const localRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = textareaRef ?? localRef;
  const inline = Boolean(parent);
  const parentName = parent ? authorName(parent.author) : null;
  const images = useAttachImages({ text: body, setText: setBody, textareaRef: inputRef, gate: () => requireAuth('Sign in to attach images') });
  const hasText = body.trim().length > 0 && body.trim() !== (mention ? `@${mention}` : '');
  const shut = closed || refused;
  useEffect(() => {
    onTextChange?.(hasText);
  }, [hasText, onTextChange]);
  // Once the page shows the thread closed, its note says why: the last refusal needn't say it again.
  useEffect(() => {
    if (closed) setError(null);
  }, [closed]);

  const send = () => {
    if (shut) return;
    const text = body.trim();
    if (!text || (mention && text === `@${mention}`)) {
      setError('Write your reply first, then post it.');
      return;
    }
    if (images.busy) {
      setError('Wait for the image to finish uploading.');
      return;
    }
    if (!requireAuth(inline ? `Sign in to reply to ${parentName}` : 'Sign in to reply', () => sendRef.current())) return;
    create.mutate(
      { threadId: thread.id, body: text, parentId: parent?.id ?? null },
      {
        onSuccess: (reply) => {
          setBody('');
          setError(null);
          images.reset();
          onPosted?.(reply);
        },
        onError: (e) => {
          // Deleted, hidden or locked since the page loaded: the API says which. The text stays to be copied, and the
          // page re-reads the thread (api.ts useCreateReply) to show it as it is now.
          if (isClosedRefusal(e, inline)) {
            setRefused(true);
            setError(`${errorMessage(e)} Copy your reply if you want to keep it.`);
            return;
          }
          // Too many replies in an hour, a reply that went, a field the API turned down: its words say what to do.
          if (e instanceof ApiError && e.fields.body) setError(e.fields.body);
          else if (e instanceof ApiError && e.fields.parentId) setError(e.fields.parentId);
          else setError(errorMessage(e, "Your reply wasn't posted. Try again."));
        },
      },
    );
  };
  // After signing in, post the reply as it is now.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  if (me?.status === 'suspended') {
    return (
      <p className={cx('forum-compose-note', inline && 'is-inline')} role="note">
        Your account is suspended, so you can read the forum but not reply. Contact a student rep if you think this is a mistake.
      </p>
    );
  }

  const author = me && !me.needsProfile ? { id: me.id, displayName: me.displayName ?? '', year: me.year, badge: badgeOf(me) } : null;
  const guest = status === 'guest';

  return (
    <form
      className={cx('forum-composer-reply', inline && 'is-inline')}
      data-hub={inline ? 'reply-composer-inline' : 'reply-composer'}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      noValidate
    >
      <AuthorAvatar author={author} guest={!author} size={inline ? 'sm' : 'md'} className="forum-composer-reply__avatar" />
      <div className="forum-composer-reply__main">
        <input {...images.fileInput} />
        <MarkdownEditor
          label={inline ? `Reply to ${parentName}` : 'Your reply'}
          hideLabel
          value={body}
          onChange={(v) => {
            setBody(v);
            if (error && !refused) setError(null);
          }}
          error={error}
          placeholder={inline ? `Reply to ${parentName}…` : 'Write a reply…'}
          rows={inline ? 2 : 3}
          tools="basic"
          preview={false}
          onSubmit={send}
          textareaRef={inputRef}
          autoFocus={autoFocus}
          onAttachImage={shut ? undefined : images.pick}
          onImageFiles={shut ? undefined : images.addFiles}
          textareaProps={inline ? { dir: 'auto', maxLength: REPLY_MAX } : { 'data-hub': 'reply-input', dir: 'auto', maxLength: REPLY_MAX }}
        />
        <AttachmentList
          uploads={images.cards}
          onRetry={images.retry}
          onRemove={(key) => {
            images.remove(key);
            requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
          }}
        />
        <div className="forum-composer-reply__actions">
          {guest ? (
            // The same promise as "Start a thread" (UX review UX-17): nothing typed is lost to signing in.
            <span className="forum-composer-reply__guest">You’ll sign in when you post, and your reply goes up right after.</span>
          ) : shut ? null : (
            <span className="forum-composer-reply__hint" aria-hidden="true">
              <Kbd>{modKeyLabel()}</Kbd>
              <Kbd>Enter</Kbd> to post
            </span>
          )}
          <span className="forum-composer-reply__buttons">
            {onCancel ? (
              <Button variant="ghost" size="sm" onClick={onCancel} disabled={create.isPending}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" size={inline ? 'sm' : 'md'} loading={create.isPending} disabled={shut} data-hub="post-reply">
              Post reply
            </Button>
          </span>
        </div>
      </div>
    </form>
  );
}
