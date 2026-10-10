import type { ReactNode } from 'react';
import { Button, Modal } from '../../../ui';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** 'danger' for something that can't be undone. */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** A yes-or-no question before something that reaches everyone (publish) or can't be undone (delete). */
export function ConfirmDialog({ open, title, body, confirmLabel, tone = 'primary', busy = false, error, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy} data-autofocus data-hub="confirm">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="nl-confirm">
        {body}
        {error ? (
          <p className="nl-confirm__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
