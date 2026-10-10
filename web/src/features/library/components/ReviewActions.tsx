import { Check, X } from '@phosphor-icons/react';
import { useId, useRef, useState } from 'react';
import { errorMessage } from '../../../api/errors';
import { useToast } from '../../../state';
import { Button, TextArea, cx } from '../../../ui';
import { useReviewItem } from '../api';
import type { LibraryItem } from '../types';
import './ReviewActions.css';

/** Moderators: Publish, or Reject with a note the uploader will see. */
export function ReviewActions({ item, onDone, className }: { item: LibraryItem; onDone?: (item: LibraryItem) => void; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const { push } = useToast();
  const review = useReviewItem();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const pending = review.isPending ? review.variables?.body.decision : null;

  const decide = (decision: 'publish' | 'reject') => {
    setError(null);
    if (decision === 'reject' && !note.trim()) {
      setNoteError('Tell the uploader why, so they can fix it or try something else.');
      noteRef.current?.focus();
      return;
    }
    review.mutate(
      { id: item.id, body: decision === 'publish' ? { decision } : { decision, note: note.trim() } },
      {
        onSuccess: (saved) => {
          push({
            title: decision === 'publish' ? 'Published' : 'Not published',
            body: decision === 'publish' ? `“${item.title}” is in the library now.` : `The uploader can see your note on “${item.title}”.`,
            tone: decision === 'publish' ? 'success' : 'info',
          });
          onDone?.(saved);
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <div className={cx('lib-review', className)}>
      {rejecting ? (
        <div className="lib-review__reject">
          <TextArea
            ref={noteRef}
            id={`reject-${uid}`}
            label="Note for the uploader"
            hint="They’ll see this. Say what to fix, for example: “Pages 3 to 6 are missing, please upload the full paper.”"
            rows={3}
            maxLength={1000}
            value={note}
            error={noteError ?? undefined}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteError(null);
            }}
            autoFocus
          />
          <div className="lib-review__buttons">
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={!!pending}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" leadingIcon={X} loading={pending === 'reject'} onClick={() => decide('reject')}>
              Don’t publish
            </Button>
          </div>
        </div>
      ) : (
        <div className="lib-review__buttons">
          <Button size="sm" leadingIcon={X} onClick={() => setRejecting(true)} disabled={!!pending}>
            Reject
          </Button>
          <Button variant="primary" size="sm" leadingIcon={Check} loading={pending === 'publish'} onClick={() => decide('publish')}>
            Publish
          </Button>
        </div>
      )}
      {error ? (
        <p className="lib-review__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
