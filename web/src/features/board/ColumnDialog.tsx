import { useId, useState, type FormEvent } from 'react';
import type { BoardColumn } from '../../api/types';
import { Button, Modal, Select, Switch, TextField } from '../../ui';
import { useAddColumn, useDeleteColumn, useUpdateColumn } from './api';

export interface ColumnDialogProps {
  boardId: string;
  column: BoardColumn | null; // null to add a new column, or existing column to edit
  otherColumns: readonly BoardColumn[];
  cardCount?: number;
  onClose: () => void;
  onDeleted?: () => void;
}

export function ColumnDialog({
  boardId,
  column,
  otherColumns,
  cardCount = 0,
  onClose,
  onDeleted,
}: ColumnDialogProps) {
  const uid = useId().replace(/:/g, '');
  const add = useAddColumn();
  const update = useUpdateColumn();
  const remove = useDeleteColumn();

  const isEditing = !!column;
  const [name, setName] = useState(column?.name ?? '');
  const [done, setDone] = useState(column?.done ?? false);
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState(otherColumns[0]?.id ?? '');
  const [error, setError] = useState<string | undefined>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = name.trim();
    if (!t) {
      setError('Give the column a name.');
      return;
    }
    setError(undefined);

    if (isEditing) {
      update.mutate(
        { boardId, columnId: column.id, patch: { name: t, done } },
        {
          onSuccess: () => onClose(),
        },
      );
    } else {
      add.mutate(
        { boardId, body: { name: t, done } },
        {
          onSuccess: () => onClose(),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!column) return;
    remove.mutate(
      { boardId, columnId: column.id, moveTo: cardCount > 0 ? moveTo : undefined },
      {
        onSuccess: () => {
          onDeleted?.();
          onClose();
        },
      },
    );
  };

  if (deleting && column) {
    return (
      <Modal
        open
        onClose={() => setDeleting(false)}
        title={`Delete column “${column.name}”?`}
        description={
          cardCount > 0
            ? `This column holds ${cardCount} card${cardCount === 1 ? '' : 's'}. Choose where to move them first.`
            : 'This column will be permanently removed from this board.'
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={handleDelete}
            >
              Delete column
            </Button>
          </>
        }
      >
        {cardCount > 0 ? (
          <div style={{ marginTop: 'var(--sp-12)' }}>
            <Select
              label="Move remaining cards to"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              options={otherColumns.map((c) => ({
                value: c.id,
                label: `${c.name}${c.done ? ' (Done)' : ''}`,
              }))}
            />
          </div>
        ) : null}
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? 'Edit column' : 'Add column'}
      size="sm"
      footer={
        <div style={{ display: 'flex', width: '100%', justifyContent: isEditing ? 'space-between' : 'flex-end' }}>
          {isEditing ? (
            <Button
              variant="danger"
              disabled={otherColumns.length === 0}
              onClick={() => setDeleting(true)}
            >
              Delete
            </Button>
          ) : null}
          <div style={{ display: 'flex', gap: 'var(--sp-8)' }}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={`col-form-${uid}`}
              loading={add.isPending || update.isPending}
            >
              {isEditing ? 'Save' : 'Add column'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={`col-form-${uid}`} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-16)' }} noValidate>
        <TextField
          label="Column name"
          required
          value={name}
          maxLength={32}
          error={error}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. In progress, In review"
          data-autofocus
        />
        <Switch
          checked={done}
          onChange={setDone}
          label="Mark cards here as done"
          description="Cards moved here will be marked completed and leave the agenda."
        />
      </form>
    </Modal>
  );
}
