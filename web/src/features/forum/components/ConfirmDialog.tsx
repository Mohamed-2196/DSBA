import type { ReactNode } from 'react';
import { Button, Modal } from '../../../ui';
import './dialogs.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** 'danger' for deletions */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  /** what went wrong with the last try, shown above the buttons */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** "Are you sure?" for actions that can't be undone. */
export function ConfirmDialog({ open, title, body, confirmLabel, tone = 'danger', busy = false, error, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} data-autofocus>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="forum-confirm">
        <div className="forum-confirm__body">{body}</div>
        {error ? (
          <p className="forum-form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
