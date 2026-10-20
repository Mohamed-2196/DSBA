import { useId, useState, type FormEvent } from 'react';
import { Button, Modal, TextField } from '../../ui';
import { usePaperScores, useSaveScore } from './api';
import { parseScore } from './board';
import './BoardDialog.css';

export interface ScoreDialogProps {
  /** what was sat: the card's or the paper's title */
  title: string;
  score: number | null;
  onSave: (score: number | null) => void;
  onClose: () => void;
}

/** "How did it go?" after a past paper: its card reached Done, or Time me stopped. The score is kept in the student's
 *  account, for them alone. */
export function ScoreDialog({ title, score, onSave, onClose }: ScoreDialogProps) {
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
      description={`${title}. Only you see your score.`}
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

/** "How did it go?" for a past paper outside the board (Time me ended, or the paper's page): reads the score there
 *  is and saves the new one. Render it signed in, with the board on (the scores live there). `onSaved` runs on Save,
 *  not on Skip. */
export function PaperScoreDialog({
  itemId,
  title,
  onSaved,
  onClose,
}: {
  itemId: string;
  title: string;
  onSaved?: () => void;
  onClose: () => void;
}) {
  const scores = usePaperScores();
  const save = useSaveScore();
  if (scores.isPending) return null;
  return (
    <ScoreDialog
      title={title}
      score={scores.data?.[itemId] ?? null}
      onSave={(score) => {
        save.mutate({ itemId, score });
        onSaved?.();
      }}
      onClose={onClose}
    />
  );
}
