import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { BoardLabel } from '../../api/types';
import { Button, ConfirmDialog, IconButton, Modal, TextField, cx } from '../../ui';
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from './api';
import { COLORS, colorVar, type BoardColor } from './board';
import './LabelDialog.css';

export interface LabelDialogProps {
  labels: readonly BoardLabel[];
  onClose: () => void;
}

export function LabelDialog({ labels, onClose }: LabelDialogProps) {
  const create = useCreateLabel();
  const update = useUpdateLabel();
  const remove = useDeleteLabel();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<BoardColor>('cobalt');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<BoardColor>('cobalt');
  const [deletingLabel, setDeletingLabel] = useState<BoardLabel | null>(null);
  const [error, setError] = useState<string | undefined>();

  const startEdit = (l: BoardLabel) => {
    setEditingId(l.id);
    setEditName(l.name);
    setEditColor(l.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = (id: string) => {
    const t = editName.trim();
    if (!t) return;
    update.mutate(
      { id, patch: { name: t, color: editColor } },
      {
        onSuccess: () => cancelEdit(),
      },
    );
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const t = newName.trim();
    if (!t) {
      setError('Give the label a name.');
      return;
    }
    setError(undefined);
    create.mutate(
      { name: t, color: newColor },
      {
        onSuccess: () => {
          setNewName('');
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Labels"
      description="Create and color labels to categorise tasks across your boards."
      size="sm"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="label-dialog">
        {/* Existing labels */}
        {labels.length > 0 ? (
          <ul role="list" className="label-dialog__list">
            {labels.map((l) => {
              if (editingId === l.id) {
                return (
                  <li key={l.id} className="label-dialog__item is-editing">
                    <TextField
                      label="Label name"
                      hideLabel
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <div className="label-dialog__color-dots">
                      {COLORS.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          className={cx('label-dialog__color-dot', editColor === c.id && 'is-selected')}
                          style={{ backgroundColor: colorVar(c.id) }}
                          onClick={() => setEditColor(c.id)}
                        />
                      ))}
                    </div>
                    <div className="label-dialog__edit-actions">
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => saveEdit(l.id)}>
                        Save
                      </Button>
                    </div>
                  </li>
                );
              }
              return (
                <li key={l.id} className="label-dialog__item">
                  <span className="label-dialog__pill" style={{ color: colorVar(l.color) }}>
                    <span className="label-dialog__dot" style={{ backgroundColor: colorVar(l.color) }} aria-hidden="true" />
                    {l.name}
                  </span>
                  <div className="label-dialog__actions">
                    <IconButton label="Edit label" icon={PencilSimple} size="sm" onClick={() => startEdit(l)} />
                    <IconButton label="Delete label" icon={Trash} size="sm" onClick={() => setDeletingLabel(l)} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="label-dialog__empty">No labels yet. Create one below.</p>
        )}

        {/* Add new label form */}
        <form className="label-dialog__create-form" onSubmit={handleCreate}>
          <span className="label-dialog__create-title">New label</span>
          <TextField
            label="Label name"
            required
            value={newName}
            maxLength={32}
            error={error}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Urgent, Reading, Project"
          />
          <div className="label-dialog__color-row">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c.id}
                className={cx('label-dialog__color-dot', newColor === c.id && 'is-selected')}
                style={{ backgroundColor: colorVar(c.id) }}
                onClick={() => setNewColor(c.id)}
              />
            ))}
          </div>
          <Button
            size="sm"
            type="submit"
            leadingIcon={Plus}
            disabled={!newName.trim()}
            loading={create.isPending}
          >
            Add label
          </Button>
        </form>
      </div>

      <ConfirmDialog
        open={!!deletingLabel}
        title={deletingLabel ? `Delete label “${deletingLabel.name}”?` : ''}
        body="This will remove the label from all cards across your boards."
        confirmLabel="Delete label"
        tone="danger"
        onConfirm={() => {
          if (deletingLabel) remove.mutate(deletingLabel.id);
          setDeletingLabel(null);
        }}
        onClose={() => setDeletingLabel(null)}
      />
    </Modal>
  );
}
