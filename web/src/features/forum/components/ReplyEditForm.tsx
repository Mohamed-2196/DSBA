import { useRef, useState } from 'react';
import type { Reply } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { Button } from '../../../ui';
import { useUpdateReply } from '../api';
import { REPLY_MAX } from '../lib/threadForm';
import { useAttachImages } from '../lib/useAttachImages';
import { AttachmentList } from './ImageAttachments';
import { MarkdownEditor } from './MarkdownEditor';

/** A reply edited in place: its text (pictures can be added or taken out), Cancel and Save changes. */
export function ReplyEditForm({ reply, onDone }: { reply: Reply; onDone: () => void }) {
  const update = useUpdateReply();
  const [draft, setDraft] = useState(reply.body);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const images = useAttachImages({ text: draft, setText: setDraft, textareaRef });

  const save = () => {
    const text = draft.trim();
    if (!text) {
      setError('A reply needs some text. To remove it, delete it instead.');
      return;
    }
    if (images.busy) {
      setError('Wait for the image to finish uploading.');
      return;
    }
    if (text === reply.body.trim()) {
      onDone();
      return;
    }
    update.mutate(
      { replyId: reply.id, body: text },
      {
        onSuccess: () => {
          images.reset();
          onDone();
        },
        onError: (e) => setError(errorMessage(e, "Your changes weren't saved. Try again.")),
      },
    );
  };

  return (
    <div className="forum-edit">
      <input {...images.fileInput} />
      <MarkdownEditor
        label="Edit your reply"
        hideLabel
        value={draft}
        onChange={(v) => {
          setDraft(v);
          if (error) setError(null);
        }}
        error={error}
        rows={3}
        tools="basic"
        preview={false}
        autoFocus
        onSubmit={save}
        textareaRef={textareaRef}
        onAttachImage={images.pick}
        onImageFiles={images.addFiles}
        textareaProps={{ dir: 'auto', maxLength: REPLY_MAX }}
      />
      <AttachmentList
        uploads={images.cards}
        onRetry={images.retry}
        onRemove={(key) => {
          images.remove(key);
          requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
        }}
      />
      <div className="forum-edit__actions">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={save} loading={update.isPending}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
