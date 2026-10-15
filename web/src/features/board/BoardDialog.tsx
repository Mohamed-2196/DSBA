import { useId, useState, type FormEvent } from 'react';
import type { BoardSummary } from '../../api/types';
import { Button, Modal, TextField, cx } from '../../ui';
import { useCreateBoard, useUpdateBoard } from './api';
import { COLORS, colorVar, EMOJI_CHOICES, TEMPLATES, type BoardColor, type BoardTemplate, type TemplateInfo } from './board';
import './BoardDialog.css';

export interface BoardDialogProps {
  /** null for creating a new board, or an existing board to edit */
  board: BoardSummary | null;
  onClose: () => void;
  onCreated?: (newBoardId: string) => void;
}

export function BoardDialog({ board, onClose, onCreated }: BoardDialogProps) {
  const uid = useId().replace(/:/g, '');
  const create = useCreateBoard();
  const update = useUpdateBoard();

  const [template, setTemplate] = useState<BoardTemplate>(board?.template ?? 'study');
  const [name, setName] = useState(board?.name ?? TEMPLATES.find((t) => t.id === 'study')?.suggested ?? '');
  const [emoji, setEmoji] = useState(board?.emoji ?? TEMPLATES.find((t) => t.id === 'study')?.emoji ?? '📚');
  const [color, setColor] = useState<BoardColor>(board?.color ?? 'cobalt');
  const [error, setError] = useState<string | undefined>();

  const isEditing = !!board;

  const handleTemplateSelect = (t: TemplateInfo) => {
    setTemplate(t.id);
    if (!isEditing) {
      setName(t.suggested);
      setEmoji(t.emoji);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = name.trim();
    if (!t) {
      setError('Give your board a name.');
      return;
    }
    setError(undefined);

    if (isEditing) {
      update.mutate(
        { id: board.id, patch: { name: t, emoji: emoji || null, color } },
        {
          onSuccess: () => onClose(),
        },
      );
    } else {
      create.mutate(
        { name: t, template, emoji: emoji || null, color },
        {
          onSuccess: (newBoard) => {
            onCreated?.(newBoard.id);
            onClose();
          },
        },
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? 'Edit board' : 'Create a board'}
      description={
        isEditing
          ? 'Change the board name, icon or colour.'
          : 'Choose a template to start from or customise it for your workflow.'
      }
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
            data-hub="board-save-btn"
          >
            {isEditing ? 'Save changes' : 'Create board'}
          </Button>
        </>
      }
    >
      <form id={`board-form-${uid}`} className="board-dialog-form" onSubmit={submit} noValidate>
        {!isEditing ? (
          <div className="board-dialog__templates">
            <label className="board-dialog__label">Template</label>
            <div className="board-dialog__template-grid">
              {TEMPLATES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={cx('board-dialog__template-card', template === t.id && 'is-selected')}
                  onClick={() => handleTemplateSelect(t)}
                >
                  <span className="board-dialog__template-emoji" aria-hidden="true">
                    {t.emoji}
                  </span>
                  <div className="board-dialog__template-info">
                    <strong>{t.name}</strong>
                    <span>{t.blurb}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="board-dialog__name-row">
          <TextField
            label="Board name"
            required
            value={name}
            maxLength={64}
            error={error}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Study, Coursework, Personal"
            data-autofocus
          />
        </div>

        {/* Emoji picker */}
        <div className="board-dialog__field">
          <label className="board-dialog__label">Icon</label>
          <div className="board-dialog__emoji-row">
            {EMOJI_CHOICES.map((em) => (
              <button
                type="button"
                key={em}
                className={cx('board-dialog__emoji-btn', emoji === em && 'is-selected')}
                onClick={() => setEmoji(em)}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        {/* Colour picker */}
        <div className="board-dialog__field">
          <label className="board-dialog__label">Colour</label>
          <div className="board-dialog__color-row">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c.id}
                title={c.label}
                className={cx('board-dialog__color-btn', color === c.id && 'is-selected')}
                style={{ backgroundColor: colorVar(c.id) }}
                onClick={() => setColor(c.id)}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
