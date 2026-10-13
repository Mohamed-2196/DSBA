// Find an account, suspend it or lift its suspension; with `withRoles` (the Access screen), see and change its roles.
// Only admins search by and see email addresses and phone numbers: the API leaves them out for everyone else.
import { useMemo, useState } from 'react';
import { PencilSimple, Prohibit, UserCheck, UsersThree } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import type { AdminUser } from '../../api/types';
import { useAuth } from '../../auth';
import { formatPhone } from '../../auth/identifiers';
import { useDebouncedValue, useToast } from '../../state';
import { Avatar, Badge, Button, CohortBadge, ConfirmDialog, EmptyState, Panel, QueryError, SearchField, Select, Skeleton, formatDate, timeAgo } from '../../ui';
import { useRoleCatalogue, usePeople, useUpdatePerson } from './api';
import { RolesDialog } from './RolesDialog';
import './PeopleList.css';

type Change = { status: 'active' | 'suspended' };
type Pending = { person: AdminUser; change: Change } | null;

function displayName(p: AdminUser): string {
  return p.displayName || 'No name yet';
}

interface RowProps {
  p: AdminUser;
  isSelf: boolean;
  withRoles: boolean;
  /** Suspending and lifting: only admins do it to an admin. */
  mayChangeStatus: boolean;
  onStatus: (status: 'active' | 'suspended') => void;
  onRoles: () => void;
}

function PersonRow({ p, isSelf, withRoles, mayChangeStatus, onStatus, onRoles }: RowProps) {
  const suspended = p.status === 'suspended';
  const contacts = [p.email, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(' · ');
  return (
    <tr className={suspended ? 'is-suspended' : undefined}>
      <td className="people-cell people-cell--person">
        <Avatar name={p.displayName || p.email || p.phone || ''} size="md" decorative />
        <span className="people-person">
          <span className="people-person__name">
            {displayName(p)}
            {isSelf ? (
              <Badge tone="cobalt" size="sm">
                You
              </Badge>
            ) : null}
            {suspended ? (
              <Badge tone="alert" size="sm">
                Suspended
              </Badge>
            ) : null}
          </span>
          {contacts ? <span className="people-person__ids">{contacts}</span> : null}
        </span>
      </td>
      <td className="people-cell people-cell--year" data-label="Cohort">
        {p.year ? <CohortBadge year={p.year} size="sm" /> : <span className="people-muted">None</span>}
      </td>
      {withRoles ? (
        <td className="people-cell people-cell--role" data-label="Roles">
          <span className="people-role">
            {p.roles.length ? <span className="people-role__name">{p.roles.map((r) => r.name).join(', ')}</span> : <span className="people-muted">No roles</span>}
            {isSelf ? null : (
              <Button size="sm" variant="ghost" leadingIcon={PencilSimple} onClick={onRoles} aria-label={`Change the roles of ${displayName(p)}`}>
                Change
              </Button>
            )}
          </span>
        </td>
      ) : null}
      <td className="people-cell people-cell--seen" data-label="Last seen">
        {p.lastSeenAt ? (
          <time dateTime={p.lastSeenAt} title={formatDate(p.lastSeenAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}>
            {timeAgo(p.lastSeenAt)}
          </time>
        ) : (
          <span className="people-muted">Never</span>
        )}
        <span className="people-joined">Joined {formatDate(p.createdAt)}</span>
      </td>
      <td className="people-cell people-cell--actions">
        {isSelf || !mayChangeStatus ? null : suspended ? (
          <Button size="sm" leadingIcon={UserCheck} onClick={() => onStatus('active')} aria-label={`Lift the suspension of ${displayName(p)}`}>
            Lift suspension
          </Button>
        ) : (
          <Button size="sm" variant="ghost" leadingIcon={Prohibit} onClick={() => onStatus('suspended')} aria-label={`Suspend ${displayName(p)}`}>
            Suspend
          </Button>
        )}
      </td>
    </tr>
  );
}

export function PeopleList({ withRoles = false }: { withRoles?: boolean }) {
  const { me, isAdmin } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const people = usePeople(q, role || null, true);
  const update = useUpdatePerson();
  const [pending, setPendingState] = useState<Pending>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [rolesOf, setRolesOf] = useState<AdminUser | null>(null);
  const setPending = (next: Pending) => {
    setProblem(null);
    setPendingState(next);
  };

  const list = useMemo(() => people.data?.pages.flatMap((p) => p.items) ?? [], [people.data]);
  const total = people.data?.pages[0]?.total ?? 0;
  const searchLabel = isAdmin ? 'Search by name, email or phone' : 'Search by name';

  const apply = (person: AdminUser, change: Change, done: () => void) => {
    setProblem(null);
    update.mutate(
      { id: person.id, change },
      {
        onSuccess: (p) => {
          const name = displayName(p);
          push({
            tone: 'success',
            title: change.status === 'suspended' ? `${name} is suspended` : `${name} can post again`,
            body: 'They get a notification.',
          });
          done();
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };

  const pendingName = pending ? displayName(pending.person) : '';
  const suspending = !!pending && pending.change.status === 'suspended';

  return (
    <>
      <div className="people-tools">
        <SearchField value={search} onValueChange={setSearch} placeholder={searchLabel} label={searchLabel} className="people-tools__search" />
        {withRoles ? <RoleFilter value={role} onChange={setRole} /> : null}
      </div>
      <p className="people-count" aria-live="polite">
        {people.isSuccess ? (total === 1 ? '1 person' : `${total.toLocaleString('en-GB')} people`) : ' '}
      </p>
      <Panel padding="none" className="people-panel">
        {people.isPending ? (
          <div className="people-loading" aria-busy="true" aria-label="Loading people">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="people-loading__row">
                <Skeleton circle width={32} height={32} />
                <Skeleton lines={2} />
              </div>
            ))}
          </div>
        ) : people.isError ? (
          <QueryError error={people.error} title="People didn’t load" onRetry={() => void people.refetch()} retrying={people.isFetching} size="sm" panel={false} />
        ) : list.length === 0 ? (
          <EmptyState
            size="sm"
            icon={UsersThree}
            title={q ? `No one matches “${q}”` : role ? 'No one holds this role' : 'No one here yet'}
            body={q ? (isAdmin ? 'Check the spelling, or search by email or phone number.' : 'Check the spelling, or try part of the name.') : 'Accounts show up here once people sign in.'}
            action={
              q || role ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setRole('');
                  }}
                >
                  Show everyone
                </Button>
              ) : null
            }
          />
        ) : (
          <table className="people-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Cohort</th>
                {withRoles ? <th scope="col">Roles</th> : null}
                <th scope="col">Last seen</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <PersonRow
                  key={p.id}
                  p={p}
                  isSelf={p.id === me?.id}
                  withRoles={withRoles}
                  mayChangeStatus={isAdmin || !p.roles.some((r) => r.slug === 'admin')}
                  onStatus={(status) => setPending({ person: p, change: { status } })}
                  onRoles={() => setRolesOf(p)}
                />
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {people.hasNextPage ? (
        <div className="people-more">
          <Button onClick={() => void people.fetchNextPage()} loading={people.isFetchingNextPage}>
            Show more people
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={suspending ? `Suspend ${pendingName}?` : `Lift ${pendingName}’s suspension?`}
        body={
          suspending
            ? 'They can still sign in and read, but can’t post, upload or react until you lift it, and any roles they hold give them nothing meanwhile. They get a notification.'
            : 'They can post, upload and react again. They get a notification.'
        }
        confirmLabel={suspending ? 'Suspend' : 'Lift suspension'}
        tone={suspending ? 'danger' : 'primary'}
        busy={update.isPending}
        error={pending ? problem : null}
        onConfirm={() => pending && apply(pending.person, pending.change, () => setPending(null))}
        onClose={() => setPending(null)}
      />
      {withRoles ? (
        <RolesDialog
          person={rolesOf}
          onClose={() => setRolesOf(null)}
          onSaved={(p) => {
            push({ tone: 'success', title: `${displayName(p)}’s roles are saved`, body: 'They get a notification.' });
            setRolesOf(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Only on the Access screen: reading the roles catalogue is for admins. */
function RoleFilter({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const catalogue = useRoleCatalogue();
  const options = [{ value: '', label: 'Everyone' }, ...(catalogue.data?.roles ?? []).map((r) => ({ value: r.slug, label: r.name }))];
  return <Select label="Show" hideLabel value={value} onChange={(e) => onChange(e.target.value)} options={options} className="people-tools__role" />;
}
