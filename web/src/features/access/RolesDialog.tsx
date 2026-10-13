// Which roles one person holds, as checkboxes. Saving sends exactly the ticked roles.
import { useEffect, useId, useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { AdminUser } from '../../api/types';
import { Button, Modal, QueryError, Skeleton } from '../../ui';
import { useRoleCatalogue, useSetUserRoles } from './api';

export function RolesDialog({ person, onClose, onSaved }: { person: AdminUser | null; onClose: () => void; onSaved: (p: AdminUser) => void }) {
  const uid = useId();
  const catalogue = useRoleCatalogue();
  const save = useSetUserRoles();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  // Kept while the dialog closes, so its title doesn't change on the way out.
  const [name, setName] = useState('');
  useEffect(() => {
    if (!person) return;
    setProblem(null);
    setName(person.displayName || 'No name yet');
    setTicked(new Set(person.roles.map((r) => r.id)));
  }, [person]);
  const toggle = (id: string) =>
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Modal
      open={person !== null}
      onClose={onClose}
      title={`${name}’s roles`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!catalogue.isSuccess}
            onClick={() => {
              if (!person) return;
              setProblem(null);
              save.mutate({ id: person.id, roleIds: [...ticked] }, { onSuccess: onSaved, onError: (e) => setProblem(errorMessage(e)) });
            }}
          >
            Save roles
          </Button>
        </>
      }
    >
      {catalogue.isPending ? (
        <Skeleton lines={4} />
      ) : catalogue.isError ? (
        <QueryError error={catalogue.error} title="The roles didn’t load" onRetry={() => void catalogue.refetch()} retrying={catalogue.isFetching} size="sm" panel={false} />
      ) : (
        <fieldset className="access-area">
          <legend>They get every box any of these roles has.</legend>
          {catalogue.data.roles.map((r) => (
            <label key={r.id} className="access-box" htmlFor={`${uid}-${r.id}`}>
              <input id={`${uid}-${r.id}`} type="checkbox" checked={ticked.has(r.id)} onChange={() => toggle(r.id)} />
              <span>
                {r.name}
                {r.badge ? ` (${r.badge})` : ''}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {problem ? (
        <p className="access-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </Modal>
  );
}
