import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  open: boolean;
  /** the question, naming the thing: "Delete “Week 3 notes”?" */
  title: string;
  /** what happens, and whether it can be undone */
  body?: ReactNode;
  /** the action, as a verb: "Delete", "Suspend" (never "OK" or "Yes") */
  confirmLabel: string;
  /** 'danger' for what can't be undone: the dialog then opens on Cancel, so Enter never destroys anything */
  tone?: 'primary' | 'danger';
  /** the action is running: both buttons wait, and Esc or the scrim don't close the dialog */
  busy?: boolean;
  /** what went wrong with the last try, shown above the buttons */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** more content under the body (a reason field, a checkbox) */
  children?: ReactNode;
}

/** "Are you sure?" before an action: the question, what happens, and the action named as a verb. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'primary',
  busy = false,
  error,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  const danger = tone === 'danger';
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} data-autofocus={danger ? true : undefined}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            data-autofocus={danger ? undefined : true}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ui-confirm">
        {body ? <div className="ui-confirm__body">{body}</div> : null}
        {children}
        {error ? (
          <p className="ui-confirm__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
