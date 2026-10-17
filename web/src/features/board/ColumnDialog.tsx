// A new column, or a column's name and whether its cards count as done; and deleting a column, with somewhere for
// its cards to go.
import { useId, useState, type FormEvent } from 'react';
import type { BoardColumn } from '../../api/types';
import { Button, ConfirmDialog, Modal, Select, Switch, TextField } from '../../ui';
import { useAddColumn, useDeleteColumn, useUpdateColumn } from './api';
import { columnLabel } from './board';
import './BoardDialog.css';

export interface ColumnDialogProps {
  boardId: string;
  /** the column to rename; null for a new one */
  column: BoardColumn | null;
  onClose: () => void;
}

export function ColumnDialog({ boardId, column, onClose }: ColumnDialogProps) {
  const uid = useId().replace(/:/g, '');
  const add = useAddColumn();
  const update = useUpdateColumn();
  const editing = column != null;
  const [name, setName] = useState(column?.name ?? '');
  const [done, setDone] = useState(column?.done ?? false);
  const [error, setError] = useState<string | undefined>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError('Give the column a name.');
      return;
    }
    if (editing) update.mutate({ boardId, columnId: column.id, patch: { name: n, done } }, { onSuccess: onClose });
    else add.mutate({ boardId, body: { name: n, done } }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Rename column' : 'New column'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`column-form-${uid}`} loading={add.isPending || update.isPending} data-hub="board-column-save">
            {editing ? 'Save' : 'Add column'}
          </Button>
        </>
      }
    >
      <form id={`column-form-${uid}`} className="board-dialog" onSubmit={submit} noValidate>
        <TextField
          label="Name"
          required
          value={name}
          maxLength={40}
          error={error}
          placeholder="Waiting on others"
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(undefined);
          }}
          data-autofocus
        />
        <Switch checked={done} onChange={setDone} label="Cards here count as done" description="They leave Today and stop sending reminders." />
      </form>
    </Modal>
  );
}

export interface DeleteColumnDialogProps {
  boardId: string;
  column: BoardColumn;
  /** the board's other columns */
  others: readonly BoardColumn[];
  /** how many cards the column holds */
  cardCount: number;
  onClose: () => void;
}

export function DeleteColumnDialog({ boardId, column, others, cardCount, onClose }: DeleteColumnDialogProps) {
  const remove = useDeleteColumn();
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  return (
    <ConfirmDialog
      open
      title={`Delete the ${column.name} column?`}
      body={cardCount ? `Its ${cardCount === 1 ? 'card moves' : `${cardCount} cards move`} to the column you choose.` : 'It has no cards.'}
      confirmLabel="Delete column"
      tone="danger"
      busy={remove.isPending}
      onConfirm={() => remove.mutate({ boardId, columnId: column.id, moveTo: cardCount ? moveTo : undefined }, { onSuccess: onClose })}
      onClose={onClose}
    >
      {cardCount ? (
        <Select
          label="Move its cards to"
          value={moveTo}
          onChange={(e) => setMoveTo(e.target.value)}
          options={others.map((c) => ({ value: c.id, label: columnLabel(c) }))}
        />
      ) : null}
    </ConfirmDialog>
  );
}
