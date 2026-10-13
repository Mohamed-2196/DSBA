// One role in a dialog: its name, its badge and its boxes by area. Admin is shown read-only; Student's manager boxes
// can't be ticked. When someone else saved the role first, the dialog says so and loads what's there now.
import { useId, useState } from 'react';
import { ApiError, errorMessage } from '../../api/errors';
import type { BoxOut, RoleOut } from '../../api/types';
import type { Box } from '../../auth';
import { Button, Modal, TextField } from '../../ui';
import { useCreateRole, useUpdateRole } from './api';
import { boxClosed, groupBoxes, roleChanges, type Draft } from './grid';

const STALE = 'Someone else changed this role. Load it again and redo your change.';
const STUDENT_NOTE = 'Every new account gets Student, so it holds student boxes only.';

interface Problems {
  name?: string;
  badge?: string;
  other?: string;
}

const draftOf = (role: RoleOut | null): Draft => ({ name: role?.name ?? '', badge: role?.badge ?? '', boxes: new Set(role?.boxes ?? []) });

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
  const [draft, setDraft] = useState<Draft>(() => draftOf(role));
  const [problems, setProblems] = useState<Problems>({});

  // The draft follows the role each time the dialog opens, and again when a newer version of the role loads (after
  // a stale save), so the admin redoes their change on what's there now. The problems stay until the next opening.
  const opening = open ? (role?.id ?? 'new') : null;
  const version = role?.version ?? 0;
  const [loaded, setLoaded] = useState<{ opening: string | null; version: number }>({ opening: null, version: 0 });
  if (loaded.opening !== opening || loaded.version !== version) {
    if (loaded.opening !== opening) setProblems({});
    if (opening) setDraft(draftOf(role));
    setLoaded({ opening, version });
  }

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
    else if (e instanceof ApiError && (e.fields.name || e.fields.badge)) setProblems({ name: e.fields.name, badge: e.fields.badge });
    else if (e instanceof ApiError && e.fields.boxes) setProblems({ other: e.fields.boxes });
    else setProblems({ other: errorMessage(e) });
  };

  const save = () => {
    setProblems({});
    if (!role) {
      create.mutate(
        { name: draft.name.trim(), badge: draft.badge.trim() || null, boxes: [...draft.boxes].sort() },
        { onSuccess: (r) => onSaved(r.name), onError: fail },
      );
      return;
    }
    const body = roleChanges(role, draft);
    if (!body) {
      onClose();
      return;
    }
    update.mutate({ id: role.id, body }, { onSuccess: (r) => onSaved(r.name), onError: fail });
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
      </div>
    </Modal>
  );
}
