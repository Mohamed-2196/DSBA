// A card's comments in its drawer: notes the student leaves themselves as the work goes on. Only they see them.
import { ChatCircleDots, Trash } from '@phosphor-icons/react';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { BoardCardDetail } from '../../api/types';
import { formatClock, formatDay } from '../../lib/dates';
import { Button, IconButton, TextArea } from '../../ui';
import { useAddComment, useDeleteComment } from './api';

/** The API keeps up to 100 comments on a card, each up to 2,000 characters. */
const MAX_COMMENTS = 100;
const MAX_LENGTH = 2000;

const when = (iso: string) => {
  const at = new Date(iso);
  return `${formatDay(at, { weekday: 'short', month: 'short', year: false })}, ${formatClock(at)}`;
};

export function CardComments({ card, readOnly }: { card: BoardCardDetail; readOnly: boolean }) {
  const headingId = useId();
  const add = useAddComment();
  const remove = useDeleteComment();
  const [text, setText] = useState('');
  const full = card.comments.length >= MAX_COMMENTS;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || full || add.isPending) return;
    add.mutate({ cardId: card.id, boardId: card.boardId, body }, { onSuccess: () => setText('') });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section className="card-detail__section" aria-labelledby={headingId}>
      <div className="card-detail__section-head">
        <h3 className="card-detail__h" id={headingId}>
          <ChatCircleDots aria-hidden="true" />
          Comments
          {card.comments.length ? <span className="card-detail__h-count">{card.comments.length}</span> : null}
        </h3>
        <span className="card-detail__progress-text">Only you see them</span>
      </div>

      {card.comments.length ? (
        <ol className="card-comments">
          {card.comments.map((c) => (
            <li key={c.id} className="card-comments__item">
              <p className="card-comments__body">{c.body}</p>
              <div className="card-comments__foot">
                <time dateTime={c.createdAt}>{when(c.createdAt)}</time>
                {readOnly ? null : (
                  <IconButton
                    label="Delete this comment"
                    icon={Trash}
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ cardId: card.id, boardId: card.boardId, commentId: c.id })}
                  />
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : readOnly ? (
        <p className="card-detail__none">No comments.</p>
      ) : null}

      {readOnly ? null : full ? (
        <p className="card-detail__none">This card holds {MAX_COMMENTS} comments. Delete one to add another.</p>
      ) : (
        <form className="card-comments__form" onSubmit={submit}>
          <TextArea
            label="New comment"
            hideLabel
            rows={2}
            value={text}
            maxLength={MAX_LENGTH}
            placeholder="Where you got to, what to ask, what’s next"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!text.trim()} loading={add.isPending}>
            Add comment
          </Button>
        </form>
      )}
    </section>
  );
}
