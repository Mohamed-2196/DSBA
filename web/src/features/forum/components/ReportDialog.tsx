// "Report this thread / reply / file": a reason and an optional note -> POST /reports (ReportButton.tsx opens it).
import { useId, useState } from 'react';
import { ApiError, errorMessage } from '../../../api/errors';
import { Button, Modal, TextArea, cx } from '../../../ui';
import { useToast } from '../../../state';
import { useCreateReport } from '../api';
import { REPORT_NOUN, REPORT_REASONS } from '../lib/reports';
import { remainingNote } from '../lib/threadForm';
import type { ReportReason, ReportTargetType } from '../types';
import './dialogs.css';

const NOTE_MAX = 1000;

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** this person reported it already (the dialog says so) */
  already?: boolean;
  /** the report was sent, or had been sent before */
  onReported?: () => void;
}

export function ReportDialog({ open, onClose, targetType, targetId, already = false, onReported }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const report = useCreateReport();
  const { push } = useToast();
  const uid = useId().replace(/:/g, '');
  const noun = REPORT_NOUN[targetType];
  const count = remainingNote(note.length, NOTE_MAX);

  const close = () => {
    if (report.isPending) return;
    onClose();
    // Start fresh next time.
    setReason(null);
    setNote('');
    setError(null);
  };

  const submit = () => {
    if (!reason) {
      setError('Choose what is wrong with it.');
      return;
    }
    setError(null);
    report.mutate(
      { targetType, targetId, reason, note: note.trim() || null },
      {
        onSuccess: () => {
          close();
          onReported?.();
          push({ title: 'Report sent', body: 'Thank you. A student rep will look at it.', tone: 'success' });
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'already_reported') {
            close();
            onReported?.();
            push({
              title: `You've already reported this ${noun}`,
              body: 'A student rep will look at it soon. No need to report it again.',
              tone: 'info',
            });
            return;
          }
          if (e instanceof ApiError && e.status === 404) {
            close();
            push({ title: `This ${noun} is gone`, body: 'It was removed before your report was sent.', tone: 'info' });
            return;
          }
          setError(errorMessage(e, "Your report wasn't sent. Try again."));
        },
      },
    );
  };

  const hint =
    reason === 'other'
      ? 'Say what is wrong, so the reps know what to look for.'
      : 'Optional. Anything that helps the reps understand.';

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={`Report this ${noun}`}
      description="Student reps will look at it. Only admins can see who reported it."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={report.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={report.isPending} data-hub="report-send">
            Send report
          </Button>
        </>
      }
    >
      <form
        className="forum-report"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        {already ? (
          <p className="forum-report__already" role="note">
            You reported this {noun} already. A student rep will look at it; there’s no need to report it again.
          </p>
        ) : null}
        <fieldset className="forum-report__reasons" aria-describedby={error ? `r${uid}-err` : undefined}>
          <legend className="forum-report__legend">What’s wrong with it?</legend>
          {REPORT_REASONS.map((r, i) => (
            <label key={r.value} className={cx('forum-report__reason', reason === r.value && 'is-checked')}>
              <input
                type="radio"
                name={`report-reason-${uid}`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => {
                  setReason(r.value);
                  setError(null);
                }}
                data-autofocus={i === 0 ? true : undefined}
              />
              <span className="forum-report__text">
                <span className="forum-report__label">{r.label}</span>
                <span className="forum-report__hint">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <TextArea
          label="Add a note"
          hint={count ? `${hint} ${count}` : hint}
          rows={3}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          dir="auto"
        />
        {error ? (
          <p id={`r${uid}-err`} className="forum-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
