// Every role, its badge, how many people hold it and its boxes: a grid with roles across and boxes down, or one card
// per role on phones. Admins open a role to edit it.
import { useState } from 'react';
import { Check, Lock, Plus, Trash } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import type { BoxOut, RoleOut } from '../../api/types';
import { BREAKPOINTS, useMediaQuery, useToast } from '../../state';
import { Badge, Button, ConfirmDialog, Panel, QueryError, Skeleton, formatCount } from '../../ui';
import { useDeleteRole, useRoleCatalogue } from './api';
import { groupBoxes } from './grid';
import { RoleEditor } from './RoleEditor';

const people = (n: number) => (n === 1 ? '1 person' : `${formatCount(n)} people`);
const holders = (n: number) =>
  n === 0 ? 'Nobody holds it.' : n === 1 ? '1 person holds it.' : `${formatCount(n)} people hold it.`;
const holds = (r: RoleOut, key: BoxOut['key']) => r.locked || r.boxes.includes(key);

function RoleHeader({ role, onEdit, onDelete }: { role: RoleOut; onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="access-role">
      <span className="access-role__name">
        {role.locked ? <Lock aria-hidden="true" weight="bold" /> : null}
        {role.name}
        {role.locked ? <span className="visually-hidden"> (can’t be changed)</span> : null}
      </span>
      {role.badge ? <Badge size="sm">{role.badge}</Badge> : null}
      <span className="access-role__holders">{people(role.holders)}</span>
      <span className="access-role__actions">
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`${role.locked ? 'See' : 'Edit'} ${role.name}`}>
          {role.locked ? 'See' : 'Edit'}
        </Button>
        {role.builtIn || role.locked ? null : (
          <Button size="sm" variant="ghost" leadingIcon={Trash} onClick={onDelete} aria-label={`Delete ${role.name}`}>
            Delete
          </Button>
        )}
      </span>
    </span>
  );
}

export function RolesTab() {
  const catalogue = useRoleCatalogue();
  const remove = useDeleteRole();
  const { push } = useToast();
  const narrow = useMediaQuery(BREAKPOINTS.mobile);
  // A role's id, or 'new' (ids are UUIDs, so they never read 'new').
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RoleOut | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (catalogue.isPending) return <Skeleton lines={6} />;
  if (catalogue.isError) {
    return (
      <QueryError
        error={catalogue.error}
        title="Roles didn’t load"
        onRetry={() => void catalogue.refetch()}
        retrying={catalogue.isFetching}
      />
    );
  }
  const { roles, boxes } = catalogue.data;
  const groups = groupBoxes(boxes);
  // The role being edited, as the catalogue has it now: a reload after a stale save hands the editor the new version.
  const editingRole = editing === 'new' ? null : (roles.find((r) => r.id === editing) ?? null);
  const header = (r: RoleOut) => (
    <RoleHeader role={r} onEdit={() => setEditing(r.id)} onDelete={() => setDeleting(r)} />
  );

  const closeDelete = () => {
    setProblem(null);
    setDeleting(null);
  };

  return (
    <>
      <div className="access-tools">
        <Button variant="primary" leadingIcon={Plus} onClick={() => setEditing('new')}>
          New role
        </Button>
      </div>
      {narrow ? (
        <ul role="list" className="access-cards">
          {roles.map((r) => {
            const held = boxes.filter((b) => holds(r, b.key));
            return (
              <li key={r.id}>
                <Panel padding="md" className="access-card">
                  {header(r)}
                  {held.length ? (
                    <ul className="access-card__boxes">
                      {held.map((b) => (
                        <li key={b.key}>{b.label}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="access-note">No boxes.</p>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      ) : (
        <Panel padding="none" className="access-grid-wrap">
          <table className="access-grid">
            <thead>
              <tr>
                <th scope="col" className="access-grid__corner">
                  Box
                </th>
                {roles.map((r) => (
                  <th key={r.id} scope="col">
                    {header(r)}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.area}>
                <tr>
                  <th scope="rowgroup" colSpan={roles.length + 1} className="access-grid__area">
                    {g.area}
                  </th>
                </tr>
                {g.boxes.map((b) => (
                  <tr key={b.key}>
                    <th scope="row">{b.label}</th>
                    {roles.map((r) => (
                      <td key={r.id}>
                        {holds(r, b.key) ? (
                          <Check aria-hidden="true" weight="bold" className="access-grid__yes" />
                        ) : null}
                        <span className="visually-hidden">{holds(r, b.key) ? 'Yes' : 'No'}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Panel>
      )}
      <RoleEditor
        open={editing !== null && (editing === 'new' || editingRole !== null)}
        role={editingRole}
        boxes={boxes}
        onClose={() => setEditing(null)}
        onSaved={(name) => {
          setEditing(null);
          push({ tone: 'success', title: `${name} is saved`, body: 'People who hold it have its boxes now.' });
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.name}?` : ''}
        body={deleting ? `${holders(deleting.holders)} They lose its powers and get a notification.` : ''}
        confirmLabel="Delete role"
        tone="danger"
        busy={remove.isPending}
        error={problem}
        onConfirm={() => {
          if (!deleting) return;
          setProblem(null);
          remove.mutate(deleting.id, {
            onSuccess: () => {
              push({ tone: 'success', title: `${deleting.name} is deleted` });
              closeDelete();
            },
            onError: (e) => setProblem(errorMessage(e)),
          });
        }}
        onClose={closeDelete}
      />
    </>
  );
}
