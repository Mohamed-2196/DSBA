import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Reply, ThreadDetail } from '../../../api/types';
import { ApiError, errorMessage } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { Button, Kbd, cx, modKeyLabel } from '../../../ui';
import { useCreateReply } from '../api';
import { authorName } from '../lib/authors';
import { imageMarkdown, insertBlock, removeImageLines } from '../lib/editing';
import { useImageUploads } from '../lib/uploads';
import { AuthorAvatar } from './AuthorAvatar';
import { AttachmentList } from './ImageAttachments';
import { useImagePicker } from '../lib/useImagePicker';
import { MarkdownEditor } from './MarkdownEditor';

const REPLY_MAX = 10_000;

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
}

/**
 * Write a reply. At the bottom of a thread (data-hub="reply-composer", textarea "reply-input"), or inline under a reply
 * when `parent` is set (replies to a nested reply attach to its parent and mention the person).
 * Guests can write; posting asks them to sign in first and then posts what they wrote.
 */
export function ReplyComposer({ thread, parent = null, mention = null, onPosted, onCancel, textareaRef, autoFocus = false }: ReplyComposerProps) {
  const { me, requireAuth } = useAuth();
  const create = useCreateReply();
  const [body, setBody] = useState(mention ? `@${mention} ` : '');
  const [error, setError] = useState<string | null>(null);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = textareaRef ?? localRef;
  const inline = Boolean(parent);
  const parentName = parent ? authorName(parent.author) : null;

  const uploads = useImageUploads((img) => {
    setBody((text) => {
      const el = inputRef.current;
      return insertBlock(text, el ? el.selectionEnd : text.length, imageMarkdown(img.alt, img.mediaUrl)).text;
    });
  });
  const picker = useImagePicker((file) => uploads.start(file));
  const attach = () => {
    if (!requireAuth('Sign in to attach images')) return;
    picker.open();
  };
  // A card is only kept while its picture is still in the text.
  const cards = uploads.items.filter((u) => u.phase !== 'done' || (u.mediaUrl && body.includes(u.mediaUrl)));

  const send = () => {
    const text = body.trim();
    if (!text || (mention && text === `@${mention}`)) {
      setError('Write your reply first, then post it.');
      return;
    }
    if (uploads.busy) {
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
          uploads.reset();
          onPosted?.(reply);
        },
        onError: (e) => {
          // thread_locked: locked, hidden or deleted since the page loaded (the API says which).
          if (e instanceof ApiError && e.code === 'thread_locked') setError(e.message || 'This thread can’t take new replies now.');
          else if (e instanceof ApiError && e.fields.body) setError(e.fields.body);
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
      <AuthorAvatar author={me && !me.needsProfile ? { id: me.id, displayName: me.displayName ?? '', year: me.year, role: me.role } : null} size={inline ? 'sm' : 'md'} className="forum-composer-reply__avatar" />
      <div className="forum-composer-reply__main">
        {picker.input}
        <MarkdownEditor
          label={inline ? `Reply to ${parentName}` : 'Your reply'}
          hideLabel
          value={body}
          onChange={(v) => {
            setBody(v);
            if (error) setError(null);
          }}
          error={error}
          placeholder={inline ? `Reply to ${parentName}…` : 'Write a reply…'}
          rows={inline ? 2 : 3}
          tools="basic"
          preview={false}
          onSubmit={send}
          textareaRef={inputRef}
          autoFocus={autoFocus}
          onAttachImage={attach}
          onImageFiles={(files) => {
            if (!requireAuth('Sign in to attach images')) return;
            files.forEach((f) => uploads.start(f));
          }}
          textareaProps={inline ? { dir: 'auto', maxLength: REPLY_MAX } : { 'data-hub': 'reply-input', dir: 'auto', maxLength: REPLY_MAX }}
        />
        <AttachmentList
          uploads={cards}
          onRetry={uploads.retry}
          onRemove={(key) => {
            const u = uploads.items.find((x) => x.key === key);
            if (u?.mediaUrl) setBody((text) => removeImageLines(text, u.mediaUrl as string));
            uploads.remove(key);
          }}
        />
        <div className="forum-composer-reply__actions">
          <span className="forum-composer-reply__hint" aria-hidden="true">
            <Kbd>{modKeyLabel()}</Kbd>
            <Kbd>Enter</Kbd> to post
          </span>
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={create.isPending}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="primary" size={inline ? 'sm' : 'md'} loading={create.isPending} data-hub="post-reply">
            Post reply
          </Button>
        </div>
      </div>
    </form>
  );
}
