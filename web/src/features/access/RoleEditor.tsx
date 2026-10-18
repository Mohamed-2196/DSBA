// One role in a dialog: its name, its badge and its boxes by area. Admin is shown read-only; Student's manager boxes
// can't be ticked. When someone else saved the role first, the dialog says so and offers to load what's there now.
import { useId, useState } from 'react';
import { ApiError, errorMessage } from '../../api/errors';
import type { BoxOut, RoleOut } from '../../api/types';
import type { Box } from '../../auth';
import { Button, Modal, TextField } from '../../ui';
import { useCreateRole, useUpdateRole } from './api';
import { boxClosed, followOpening, groupBoxes, roleChanges, startEditing, type Draft, type Editing } from './grid';

const STALE = 'Someone else changed this role. Load it again and redo your change.';
const STUDENT_NOTE = 'Every new account gets Student, so it holds student boxes only.';

interface Problems {
  name?: string;
  badge?: string;
  other?: string;
}

export interface RoleEditorProps {
  /** the role to edit, as the catalogue has it now; null: a new role */
  role: RoleOut | null;
  boxes: BoxOut[];
  open: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
}

export function RoleEditor({ role, boxes, open, onClose, onSaved }: RoleEditorProps) {
  const uid = useId();
  const create = useCreateRole();
  const update = useUpdateRole();
  const [problems, setProblems] = useState<Problems>({});

  // The draft starts from the role each time the dialog opens and stays until it is saved or discarded: a background
  // reload of the role leaves it alone. After a stale save, "Load it again" starts over from what's there now.
  const opening = open ? (role?.id ?? 'new') : null;
  const [editing, setEditing] = useState<Editing>(() => startEditing(null, null));
  const followed = followOpening(editing, opening, role);
  if (followed !== editing) {
    setProblems({});
    setEditing(followed);
  }
  const { base, draft } = followed;
  const setDraft = (change: (d: Draft) => Draft) => setEditing((e) => ({ ...e, draft: change(e.draft) }));
  const stale = problems.other === STALE && role !== null && base !== null && role.version !== base.version;
  const loadAgain = () => {
    setProblems({});
    setEditing(startEditing(opening, role));
  };

  const locked = !!role?.locked;
  const student = role?.slug === 'student';
  const busy = create.isPending || update.isPending;

  const toggle = (key: Box) =>
    setDraft((d) => {
      const next = new Set(d.boxes);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...d, boxes: next };
    });

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'role_changed') setProblems({ other: STALE });
    else if (e instanceof ApiError && (e.fields.name || e.fields.badge))
      setProblems({ name: e.fields.name, badge: e.fields.badge });
    else if (e instanceof ApiError && e.fields.boxes) setProblems({ other: e.fields.boxes });
    else setProblems({ other: errorMessage(e) });
  };

  const save = () => {
    setProblems({});
    if (!base) {
      create.mutate(
        { name: draft.name.trim(), badge: draft.badge.trim() || null, boxes: [...draft.boxes].sort() },
        { onSuccess: (r) => onSaved(r.name), onError: fail },
      );
      return;
    }
    const body = roleChanges(base, draft);
    if (!body) {
      onClose();
      return;
    }
    update.mutate({ id: base.id, body }, { onSuccess: (r) => onSaved(r.name), onError: fail });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? (locked ? role.name : `Edit ${role.name}`) : 'New role'}
      size="lg"
      footer={
        locked ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={busy} disabled={draft.name.trim().length < 2}>
              {role ? 'Save' : 'Create role'}
            </Button>
          </>
        )
      }
    >
      <div className="access-editor">
        {locked ? <p className="access-note">Admin always holds every box, and can’t be changed.</p> : null}
        <TextField
          label="Name"
          value={draft.name}
          disabled={locked}
          maxLength={40}
          error={problems.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <TextField
          label="Badge"
          hint="Shown next to their name, such as “Newsletter”. Leave it empty for none."
          value={draft.badge}
          disabled={locked}
          maxLength={24}
          error={problems.badge}
          onChange={(e) => setDraft((d) => ({ ...d, badge: e.target.value }))}
        />
        {student ? <p className="access-note">{STUDENT_NOTE}</p> : null}
        {groupBoxes(boxes).map((g) => (
          <fieldset key={g.area} className="access-area">
            <legend>{g.area}</legend>
            {g.boxes.map((b) => {
              const closed = boxClosed(role, b.key);
              return (
                <label key={b.key} className="access-box" htmlFor={`${uid}-${b.key}`} data-closed={closed || undefined}>
                  <input
                    id={`${uid}-${b.key}`}
                    type="checkbox"
                    checked={locked || draft.boxes.has(b.key)}
                    disabled={locked || closed}
                    onChange={() => toggle(b.key)}
                  />
                  <span>{b.label}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
        {problems.other ? (
          <p className="access-problem" role="alert">
            {problems.other}
          </p>
        ) : null}
        {stale ? (
          <Button size="sm" onClick={loadAgain}>
            Load it again
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
