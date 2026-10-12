import { useState } from 'react';
import type { Reply } from '../../../api/types';
import { errorMessage } from '../../../api/errors';
import { Button } from '../../../ui';
import { useUpdateReply } from '../api';
import { MarkdownEditor } from './MarkdownEditor';

const REPLY_MAX = 10_000;

/** A reply edited in place: its text, Cancel and Save changes. */
export function ReplyEditForm({ reply, onDone }: { reply: Reply; onDone: () => void }) {
  const update = useUpdateReply();
  const [draft, setDraft] = useState(reply.body);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const text = draft.trim();
    if (!text) {
      setError('A reply needs some text. To remove it, delete it instead.');
      return;
    }
    if (text === reply.body.trim()) {
      onDone();
      return;
    }
    update.mutate({ replyId: reply.id, body: text }, { onSuccess: onDone, onError: (e) => setError(errorMessage(e, "Your changes weren't saved. Try again.")) });
  };

  return (
    <div className="forum-edit">
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
        textareaProps={{ dir: 'auto', maxLength: REPLY_MAX }}
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
