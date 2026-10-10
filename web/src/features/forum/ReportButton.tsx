// "Report" for a thread, a reply or a library item: a small dialog (reason + optional note) -> POST /reports.
// Guests are asked to sign in first. Reporting the same thing twice is answered kindly (already_reported).
// Used by the forum on threads and replies, and by the library on files (features/forum/public.ts).
import { useId, useState } from 'react';
import { Flag } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { Button, Modal, TextArea, cx } from '../../ui';
import { useToast } from '../../state';
import { useCreateReport } from './api';
import { REPORT_NOUN as NOUN, REPORT_REASONS } from './lib/reports';
import type { ReportReason, ReportTargetType } from './types';
import './components/dialogs.css';

export interface ReportButtonProps {
  targetType: 'thread' | 'reply' | 'library_item';
  targetId: string;
  /** Visible text; defaults to 'Report'. */
  label?: string;
  className?: string;
}


const NOTE_MAX = 1000;

export interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
}

/** The dialog behind ReportButton (the forum's post menus open it too). */
export function ReportDialog({ open, onClose, targetType, targetId }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const report = useCreateReport();
  const { push } = useToast();
  const uid = useId().replace(/:/g, '');
  const noun = NOUN[targetType];

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
          push({ title: 'Report sent', body: 'Thank you. A student rep will look at it.', tone: 'success' });
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'already_reported') {
            close();
            push({ title: `You've already reported this ${noun}`, body: 'A student rep will look at it soon. No need to report it again.', tone: 'info' });
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
          hint={reason === 'other' ? 'Say what is wrong, so the reps know what to look for.' : 'Optional. Anything that helps the reps understand.'}
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

/** A quiet "Report" button and its dialog. */
export function ReportButton({ targetType, targetId, label = 'Report', className }: ReportButtonProps) {
  const { requireAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const noun = NOUN[targetType];
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        leadingIcon={Flag}
        className={cx('forum-report-button', className)}
        onClick={() => {
          if (!requireAuth(`Sign in to report this ${noun}`, () => setOpen(true))) return;
          setOpen(true);
        }}
        data-hub="report-button"
      >
        {label}
      </Button>
      <ReportDialog open={open} onClose={() => setOpen(false)} targetType={targetType} targetId={targetId} />
    </>
  );
}
