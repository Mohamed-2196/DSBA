import { useId, useState, type FormEvent } from 'react';
import type { BoardCard } from '../../api/types';
import { Button, Modal, TextField } from '../../ui';
import { parseScore } from './board';
import './BoardDialog.css';

export interface ScoreDialogProps {
  card: BoardCard;
  score: number | null;
  onSave: (score: number | null) => void;
  onClose: () => void;
}

/** "How did it go?" after a past paper reaches Done. The score stays in this browser. */
export function ScoreDialog({ card, score, onSave, onClose }: ScoreDialogProps) {
  const uid = useId().replace(/:/g, '');
  const [raw, setRaw] = useState(score == null ? '' : String(score));
  const [error, setError] = useState<string | undefined>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseScore(raw);
    if (parsed === undefined) {
      setError('Type a percentage from 0 to 100, or leave it empty.');
      return;
    }
    onSave(parsed);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="How did it go?"
      description={`${card.title}. Your score stays on this device, and only you see it. Signing out clears it.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Skip
          </Button>
          <Button variant="primary" type="submit" form={`board-score-${uid}`} data-hub="board-score-save">
            Save
          </Button>
        </>
      }
    >
      <form id={`board-score-${uid}`} className="board-form" onSubmit={submit} noValidate>
        <TextField
          label="Your score"
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          error={error}
          hint="Optional"
          trailing="%"
          data-autofocus
        />
      </form>
    </Modal>
  );
}
