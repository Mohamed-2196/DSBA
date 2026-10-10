import { useState } from 'react';
import { Button, Kbd, cx, modKeyLabel } from '../../../ui';
import { useYear } from '../../../state';
import { authorLabel, getAuthor, ME_ID } from '../data/authors';
import { useForum } from '../state/context';
import { AuthorAvatar } from './AuthorAvatar';
import { MarkdownEditor } from './MarkdownEditor';

/**
 * Write a reply. At the bottom of a thread (data-hub="reply-composer", textarea "reply-input"),
 * or inline under a reply when `parent` is set (one level of nesting: replies to a nested reply
 * attach to its parent and mention the person).
 */
export function ReplyComposer({ thread, parent = null, mention = null, onPosted, onCancel, textareaRef, autoFocus = false }) {
  const { postReply } = useForum();
  const { year } = useYear();
  const [body, setBody] = useState(mention ? `@${mention} ` : '');
  const [error, setError] = useState(null);
  const me = getAuthor(ME_ID);
  const inline = Boolean(parent);
  const parentName = parent ? authorLabel(getAuthor(parent.authorId)) : null;

  const submit = (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || (mention && text === `@${mention}`)) {
      setError('Write your reply first, then post it.');
      return;
    }
    const reply = postReply({ threadId: thread.id, parentId: parent?.id || null, body: text, year });
    setBody('');
    setError(null);
    onPosted?.(reply);
  };

  return (
    <form
      className={cx('forum-composer-reply', inline && 'is-inline')}
      data-hub={inline ? 'reply-composer-inline' : 'reply-composer'}
      onSubmit={submit}
      noValidate
    >
      <AuthorAvatar author={me} size={inline ? 'sm' : 'md'} className="forum-composer-reply__avatar" />
      <div className="forum-composer-reply__main">
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
          onSubmit={submit}
          textareaRef={textareaRef}
          autoFocus={autoFocus}
          textareaProps={inline ? { dir: 'auto' } : { 'data-hub': 'reply-input', dir: 'auto' }}
        />
        <div className="forum-composer-reply__actions">
          <span className="forum-composer-reply__hint" aria-hidden="true">
            <Kbd>{modKeyLabel()}</Kbd>
            <Kbd>Enter</Kbd> to post
          </span>
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" variant="primary" size={inline ? 'sm' : 'md'}>
            Post reply
          </Button>
        </div>
      </div>
    </form>
  );
}
