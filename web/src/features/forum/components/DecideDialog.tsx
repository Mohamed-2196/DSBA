// Resolve or dismiss a report (ReportsQueue.tsx), with an optional note other reps see.
import { useState } from 'react';
import type { ReportOut } from '../../../api/types';
import { ApiError, errorMessage } from '../../../api/errors';
import { Button, Modal, TextArea } from '../../../ui';
import { useToast } from '../../../state';
import { useResolveReport } from '../api';
import { remainingNote } from '../lib/threadForm';
import type { Decision } from './ReportCard';
import './dialogs.css';

const NOTE_MAX = 1000;

export function DecideDialog({
  decision,
  onClose,
}: {
  decision: { report: ReportOut; status: Decision } | null;
  onClose: () => void;
}) {
  const resolve = useResolveReport();
  const { push } = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const status = decision?.status ?? 'resolved';
  const count = remainingNote(note.length, NOTE_MAX);

  const close = () => {
    if (resolve.isPending) return;
    onClose();
    setNote('');
    setError(null);
  };
  const confirm = () => {
    if (!decision) return;
    resolve.mutate(
      { reportId: decision.report.id, status, note: note.trim() || null },
      {
        onSuccess: () => {
          push({
            title: status === 'resolved' ? 'Report resolved' : 'Report dismissed',
            body: 'The person who reported it has been told.',
            tone: 'success',
          });
          setNote('');
          setError(null);
          onClose();
        },
        onError: (e) => {
          if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
            push({ title: 'Someone got there first', body: 'Another rep already closed this report.', tone: 'info' });
            onClose();
            return;
          }
          setError(errorMessage(e, 'That didn’t work. Try again.'));
        },
      },
    );
  };

  return (
    <Modal
      open={!!decision}
      onClose={close}
      size="sm"
      title={status === 'resolved' ? 'Resolve this report' : 'Dismiss this report'}
      description={
        status === 'resolved'
          ? 'Resolve it once you have dealt with the post, for example by hiding it.'
          : 'Dismiss it when the post is fine as it is. Nothing changes on the post.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={resolve.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} loading={resolve.isPending} data-hub="report-decide">
            {status === 'resolved' ? 'Resolve report' : 'Dismiss report'}
          </Button>
        </>
      }
    >
      <div className="forum-confirm">
        <TextArea
          label="Note"
          hint={`Optional. What you did, or why nothing needed doing. Other reps see it.${count ? ` ${count}` : ''}`}
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-autofocus
          dir="auto"
        />
        {error ? (
          <p className="forum-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
