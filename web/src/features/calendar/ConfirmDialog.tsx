import type { ReactNode } from 'react';
import { Button, Modal } from '../../ui';

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

/** A yes-or-no question before something that affects everyone (delete an event). */
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
          <Button variant={tone} onClick={onConfirm} loading={busy} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="cal-confirm">
        {typeof body === 'string' ? <p>{body}</p> : body}
        {error ? (
          <p className="cal-form__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
