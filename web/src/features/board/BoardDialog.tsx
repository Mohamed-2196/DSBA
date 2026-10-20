// A new board (from a template, with its name, colour and an optional icon), or an existing board's name, colour and
// icon.
import { useId, useState, type FormEvent } from 'react';
import type { BoardSummary } from '../../api/types';
import { Button, Modal, TextField, cx, Icon, glyph } from '../../ui';
import { useCreateBoard, useUpdateBoard } from './api';
import { EMOJI_CHOICES, startName, TEMPLATES, type BoardColor, type BoardTemplate } from './board';
import { ColorPicker } from './ColorPicker';
import './BoardDialog.css';

export interface BoardDialogProps {
  /** the board to edit; null for a new one */
  board: BoardSummary | null;
  /** every board's name, so a new one doesn't repeat one */
  taken: readonly string[];
  onClose: () => void;
  onCreated?: (boardId: string) => void;
}

const DEFAULT = TEMPLATES[0];

export function BoardDialog({ board, taken, onClose, onCreated }: BoardDialogProps) {
  const uid = useId().replace(/:/g, '');
  const create = useCreateBoard();
  const update = useUpdateBoard();
  const editing = board != null;
  const [template, setTemplate] = useState<BoardTemplate>(DEFAULT?.id ?? 'study');
  const [name, setName] = useState(board?.name ?? startName(DEFAULT?.suggested ?? 'Study', taken));
  const [named, setNamed] = useState(editing);
  const [color, setColor] = useState<BoardColor>(board?.color ?? DEFAULT?.color ?? 'cobalt');
  const [emoji, setEmoji] = useState<string | null>(board?.emoji ?? null);
  const [error, setError] = useState<string | undefined>();

  const pick = (id: BoardTemplate) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTemplate(id);
    setColor(t.color);
    if (!named) setName(startName(t.suggested, taken));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError('Give the board a name.');
      return;
    }
    if (editing) update.mutate({ id: board.id, patch: { name: n, color, emoji } }, { onSuccess: onClose });
    else
      create.mutate(
        { name: n, template, color, emoji },
        {
          onSuccess: (made) => {
            onCreated?.(made.id);
            onClose();
          },
        },
      );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit board' : 'New board'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={`board-form-${uid}`}
            loading={create.isPending || update.isPending}
            data-hub="board-save"
          >
            {editing ? 'Save' : 'Make board'}
          </Button>
        </>
      }
    >
      <form id={`board-form-${uid}`} className="board-dialog" onSubmit={submit} noValidate>
        {editing ? null : (
          <fieldset className="board-dialog__templates">
            <legend className="board-dialog__legend">Template</legend>
            <div className="board-dialog__grid">
              {TEMPLATES.map((t) => (
                <label key={t.id} className={cx('board-dialog__template', template === t.id && 'is-checked')}>
                  <input
                    type="radio"
                    name={`board-template-${uid}`}
                    value={t.id}
                    checked={template === t.id}
                    onChange={() => pick(t.id)}
                    data-autofocus={template === t.id ? true : undefined}
                  />
                  <span className="board-dialog__template-name">
                    {t.name}
                    {template === t.id ? <Icon glyph={glyph.success} /> : null}
                  </span>
                  <span className="board-dialog__template-cols">
                    {t.id === 'weekly' ? 'Monday to Sunday, Done' : t.columns.join(', ')}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <TextField
          label="Name"
          required
          value={name}
          maxLength={60}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setNamed(true);
            if (error) setError(undefined);
          }}
          data-autofocus={editing ? true : undefined}
          data-hub="board-name"
        />

        <ColorPicker legend="Colour" value={color} onChange={setColor} />

        <fieldset className="board-dialog__icons">
          <legend className="board-dialog__legend">
            Icon <span className="board-dialog__optional">optional</span>
          </legend>
          <div className="board-dialog__icon-row">
            <label className={cx('board-dialog__icon', emoji == null && 'is-checked')}>
              <input type="radio" name={`board-icon-${uid}`} checked={emoji == null} onChange={() => setEmoji(null)} />
              <span className="board-dialog__icon-none">None</span>
            </label>
            {EMOJI_CHOICES.map((em) => (
              <label key={em} className={cx('board-dialog__icon', emoji === em && 'is-checked')}>
                <input type="radio" name={`board-icon-${uid}`} checked={emoji === em} onChange={() => setEmoji(em)} />
                <span className="board-dialog__icon-glyph">{em}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
