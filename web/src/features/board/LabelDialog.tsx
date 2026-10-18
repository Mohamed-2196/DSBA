// The student's labels, the same on every board: make one, rename or recolour it, or delete it (it leaves every
// card).
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BoardLabel } from '../../api/types';
import { errorMessage, isApiError } from '../../api/errors';
import { Button, ConfirmDialog, IconButton, Modal, TextField } from '../../ui';
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from './api';
import { colorVar, type BoardColor } from './board';
import { ColorPicker } from './ColorPicker';
import './LabelDialog.css';

/** What went wrong with a label's name, said next to the field. */
const nameError = (e: unknown): string => (isApiError(e) && e.fields.name ? e.fields.name : errorMessage(e));

export interface LabelDialogProps {
  labels: readonly BoardLabel[];
  onClose: () => void;
}

export function LabelDialog({ labels, onClose }: LabelDialogProps) {
  const create = useCreateLabel();
  const remove = useDeleteLabel();
  const [name, setName] = useState('');
  const [color, setColor] = useState<BoardColor>('cobalt');
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BoardLabel | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError('Give the label a name.');
      return;
    }
    create.mutate(
      { name: n, color },
      {
        onSuccess: () => {
          setName('');
          setError(undefined);
        },
        onError: (err) => setError(nameError(err)),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Labels"
      description="Labels sort cards on every board. Filter a board by them."
      size="sm"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="label-dialog">
        {labels.length ? (
          <ul role="list" className="label-dialog__list">
            {labels.map((l) =>
              editing === l.id ? (
                <li key={l.id} className="label-dialog__item is-editing">
                  <LabelEdit label={l} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li key={l.id} className="label-dialog__item">
                  <span className="label-dialog__name">
                    <span className="label-dialog__dot" style={{ background: colorVar(l.color) }} aria-hidden="true" />
                    {l.name}
                  </span>
                  <IconButton label={`Edit ${l.name}`} icon={PencilSimple} size="sm" onClick={() => setEditing(l.id)} />
                  <IconButton label={`Delete ${l.name}`} icon={Trash} size="sm" onClick={() => setDeleting(l)} />
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="label-dialog__empty">No labels yet. Try Urgent, Reading or a module’s code.</p>
        )}

        <form className="label-dialog__new" onSubmit={submit} noValidate>
          <TextField
            label="New label"
            value={name}
            maxLength={30}
            error={error}
            placeholder="Urgent"
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(undefined);
            }}
            data-autofocus
          />
          <ColorPicker legend="Its colour" value={color} onChange={setColor} />
          <Button type="submit" leadingIcon={Plus} loading={create.isPending} disabled={!name.trim()}>
            Add label
          </Button>
        </form>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Delete the ${deleting.name} label?` : ''}
        body="It comes off every card on every board. The cards stay."
        confirmLabel="Delete label"
        tone="danger"
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      />
    </Modal>
  );
}

function LabelEdit({ label, onDone }: { label: BoardLabel; onDone: () => void }) {
  const update = useUpdateLabel();
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState<BoardColor>(label.color);
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError('Give the label a name.');
      return;
    }
    update.mutate({ id: label.id, patch: { name: n, color } }, { onSuccess: onDone, onError: (err) => setError(nameError(err)) });
  };
  return (
    <form className="label-dialog__edit" onSubmit={submit} noValidate>
      <TextField
        ref={inputRef}
        label={`Rename ${label.name}`}
        hideLabel
        value={name}
        maxLength={30}
        error={error}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onDone();
          }
        }}
      />
      <ColorPicker legend={`Colour of ${label.name}`} hideLegend value={color} onChange={setColor} />
      <div className="label-dialog__edit-actions">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" loading={update.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
