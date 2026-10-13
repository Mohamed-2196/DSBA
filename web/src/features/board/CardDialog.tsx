import { useId, useState, type FormEvent } from 'react';
import type { BoardCard } from '../../api/types';
import { isDayKey } from '../../lib/dates';
import { Button, Modal, TextArea, TextField } from '../../ui';
import { useAddCard, useUpdateCard } from './api';
import { columnLabel, type Column } from './board';

export interface CardDialogProps {
  /** The card to edit; null adds one to `column`. */
  card: BoardCard | null;
  column: Column;
  onClose: () => void;
}

interface Errors {
  title?: string;
  note?: string;
  dueDate?: string;
}

const MAX_TITLE = 200;
const MAX_NOTE = 2000;

/** Add a card, or edit one. Mount it with a `key` per card so each opening starts from that card. */
export function CardDialog({ card, column, onClose }: CardDialogProps) {
  const uid = useId().replace(/:/g, '');
  const add = useAddCard();
  const update = useUpdateCard();
  const [title, setTitle] = useState(card?.title ?? '');
  const [note, setNote] = useState(card?.note ?? '');
  const [dueDate, setDueDate] = useState(card?.dueDate ?? '');
  const [errors, setErrors] = useState<Errors>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Errors = {};
    const t = title.trim();
    if (!t) found.title = 'Give the card a title.';
    else if (t.length > MAX_TITLE) found.title = `Keep the title under ${MAX_TITLE} characters.`;
    if (note.trim().length > MAX_NOTE) found.note = `Keep the note under ${MAX_NOTE} characters.`;
    if (dueDate && !isDayKey(dueDate)) found.dueDate = 'Choose a date, or leave it empty.';
    setErrors(found);
    if (Object.keys(found).length) return;
    const fields = { title: t, note: note.trim() || null, dueDate: dueDate || null };
    // The board shows the change at once and the dialog closes; a refusal rolls it back with a toast (api.ts).
    if (card) update.mutate({ id: card.id, patch: fields });
    else add.mutate({ ...fields, column });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={card ? 'Edit card' : `Add a card to ${columnLabel(column)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`board-card-${uid}`} data-hub="board-save">
            {card ? 'Save' : 'Add card'}
          </Button>
        </>
      }
    >
      <form id={`board-card-${uid}`} className="board-form" onSubmit={submit} noValidate>
        <TextField
          label="Title"
          required
          value={title}
          maxLength={MAX_TITLE}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="Past paper 2023, question 4"
          data-autofocus
        />
        <TextArea label="Note" value={note} rows={3} onChange={(e) => setNote(e.target.value)} error={errors.note} hint="Optional" />
        <TextField label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} hint="Optional" />
      </form>
    </Modal>
  );
}
