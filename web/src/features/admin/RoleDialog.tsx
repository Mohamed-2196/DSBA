// "Change role": the three roles as radio cards, chosen and confirmed in one dialog (UX review UX-15). A native
// select changed the role, and asked to confirm, on the first arrow key; here arrows only move the choice.
import { useId, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { roleLabel } from '../../auth';
import { Badge, Button, Modal, cx } from '../../ui';
import type { Role } from './api';
import { ROLES, ROLE_POWERS, roleWithArticle } from './roles';

export interface RoleDialogProps {
  /** whose role; null: closed */
  person: { id: string; name: string; role: Role } | null;
  busy: boolean;
  error: string | null;
  onSave: (role: Role) => void;
  onClose: () => void;
}

export function RoleDialog({ person, busy, error, onSave, onClose }: RoleDialogProps) {
  const uid = useId().replace(/:/g, '');
  const [choice, setChoice] = useState<Role>(person?.role ?? 'student');
  const [shown, setShown] = useState<{ name: string; role: Role }>(person ?? { name: '', role: 'student' });
  const [openedFor, setOpenedFor] = useState(person?.id ?? null);

  // Each opening starts from the person's current role, before the first paint (so focus lands on it); while it
  // animates out, the dialog keeps showing the last person.
  if ((person?.id ?? null) !== openedFor) {
    setOpenedFor(person?.id ?? null);
    if (person) {
      setShown(person);
      setChoice(person.role);
    }
  }

  const changed = choice !== shown.role;
  return (
    <Modal
      open={person !== null}
      onClose={busy ? () => undefined : onClose}
      title={`Change ${shown.name}’s role`}
      description="They get a notification."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(choice)} disabled={!changed} loading={busy}>
            {changed ? `Make ${roleWithArticle(choice).replace(/^an? /, '')}` : 'Save'}
          </Button>
        </>
      }
    >
      <fieldset className="people-roles">
        <legend className="visually-hidden">Role</legend>
        {ROLES.map((r) => (
          <div key={r} className={cx('people-role-card', r === choice && 'is-checked')}>
            <input
              type="radio"
              id={`${uid}-${r}`}
              name={`role-${uid}`}
              value={r}
              checked={r === choice}
              onChange={() => setChoice(r)}
              aria-labelledby={`${uid}-${r}-t`}
              aria-describedby={r === shown.role ? `${uid}-${r}-c ${uid}-${r}-d` : `${uid}-${r}-d`}
              data-autofocus={r === shown.role ? true : undefined}
            />
            <label htmlFor={`${uid}-${r}`}>
              <span className="people-role-card__title">
                <span id={`${uid}-${r}-t`}>{roleLabel(r)}</span>
                {r === shown.role ? (
                  <Badge tone="neutral" size="sm" id={`${uid}-${r}-c`}>
                    Current
                  </Badge>
                ) : null}
              </span>
              <span id={`${uid}-${r}-d`} className="people-role-card__desc">
                {ROLE_POWERS[r]}
              </span>
            </label>
          </div>
        ))}
      </fieldset>
      {error ? (
        <p className="people-dialog-error" role="alert">
          <WarningCircle aria-hidden="true" weight="fill" />
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
