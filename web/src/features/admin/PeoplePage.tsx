// /admin/people (admins): find an account, change its role, suspend or lift a suspension; and the activity log.
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ArrowClockwise, ClockCounterClockwise, Prohibit, UserCheck, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../../api/errors';
import type { AdminUser, AdminUserPage } from '../../api/types';
import { RoleGate, roleLabel, useAuth } from '../../auth';
import { formatPhone } from '../../auth/identifiers';
import { useQueryParam, useToast } from '../../state';
import {
  Avatar, Badge, Button, CohortBadge, EmptyState, Modal, Page, PageHeader, Panel, SearchField, Select, Skeleton, TabPanel, Tabs, formatDate, timeAgo,
} from '../../ui';
import { auditActor, describeAudit } from './audit';
import { ADMIN_USERS_KEY, useAudit, usePeople, useUpdatePerson, type Role } from './api';
import './PeoplePage.css';

const ROLES: Role[] = ['student', 'moderator', 'admin'];
const ROLE_FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'student', label: 'Students' },
  { value: 'moderator', label: 'Student reps' },
  { value: 'admin', label: 'Admins' },
];
const ROLE_POWERS: Record<Role, string> = {
  student: 'They can post, vote and upload like every student, and lose any moderation powers.',
  moderator: 'Student reps moderate the forum and the library, and edit the calendar and the newsletter.',
  admin: 'Admins can do everything student reps can, and also manage people and roles.',
};

type Pending = { person: AdminUser; change: { role: Role } | { status: 'active' | 'suspended' } } | null;

function problem(e: unknown): string {
  if (e instanceof ApiError && e.code === 'network') return 'Couldn’t reach the Hub. Check your connection and try again.';
  return errorMessage(e);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function displayName(p: AdminUser): string {
  return p.displayName || 'No name yet';
}

// ── People ───────────────────────────────────────────────────────────────────────────────────

function PersonRow({ p, isSelf, onChange }: { p: AdminUser; isSelf: boolean; onChange: (change: { role: Role } | { status: 'active' | 'suspended' }) => void }) {
  const suspended = p.status === 'suspended';
  const ids = [p.email, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(' · ');
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
          <span className="people-person__ids">{ids}</span>
        </span>
      </td>
      <td className="people-cell people-cell--year" data-label="Cohort">
        {p.year ? <CohortBadge year={p.year} size="sm" /> : <span className="people-muted">None</span>}
      </td>
      <td className="people-cell people-cell--role" data-label="Role">
        <Select
          label={`Role of ${displayName(p)}`}
          hideLabel
          value={p.role}
          disabled={isSelf}
          onChange={(e) => onChange({ role: e.target.value as Role })}
          options={ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
          className="people-role"
        />
      </td>
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
        {isSelf ? null : suspended ? (
          <Button size="sm" leadingIcon={UserCheck} onClick={() => onChange({ status: 'active' })} aria-label={`Lift the suspension of ${displayName(p)}`}>
            Lift suspension
          </Button>
        ) : (
          <Button size="sm" variant="ghost" leadingIcon={Prohibit} onClick={() => onChange({ status: 'suspended' })} aria-label={`Suspend ${displayName(p)}`}>
            Suspend
          </Button>
        )}
      </td>
    </tr>
  );
}

function People() {
  const { me } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const q = useDebounced(search.trim(), 300);
  const people = usePeople(q, (role || null) as Role | null, true);
  const update = useUpdatePerson();
  const [pending, setPending] = useState<Pending>(null);

  const list = useMemo(() => people.data?.pages.flatMap((p) => p.items) ?? [], [people.data]);
  const total = people.data?.pages[0]?.total ?? 0;

  const confirm = () => {
    if (!pending) return;
    const { person, change } = pending;
    update.mutate(
      { id: person.id, change },
      {
        onSuccess: (p) => {
          const name = displayName(p);
          push({
            tone: 'success',
            title: 'role' in change ? `${name} is now ${change.role === 'admin' ? 'an admin' : change.role === 'moderator' ? 'a student rep' : 'a student'}` : change.status === 'suspended' ? `${name} is suspended` : `${name} can post again`,
            body: 'They get a notification.',
          });
          setPending(null);
        },
        onError: (err) => push({ tone: 'alert', title: 'Nothing changed', body: problem(err) }),
      },
    );
  };

  const pendingName = pending ? displayName(pending.person) : '';
  const dialog = !pending
    ? null
    : 'role' in pending.change
      ? {
          title: `Make ${pendingName} ${pending.change.role === 'admin' ? 'an admin' : pending.change.role === 'moderator' ? 'a student rep' : 'a student'}?`,
          body: ROLE_POWERS[pending.change.role],
          action: pending.change.role === 'student' ? 'Make student' : pending.change.role === 'admin' ? 'Make admin' : 'Make student rep',
          danger: false,
        }
      : pending.change.status === 'suspended'
        ? {
            title: `Suspend ${pendingName}?`,
            body: 'They can still sign in and read, but can’t post, upload or react until you lift it. Student reps and admins also lose their powers while suspended.',
            action: 'Suspend',
            danger: true,
          }
        : { title: `Lift ${pendingName}’s suspension?`, body: 'They can post, upload and react again.', action: 'Lift suspension', danger: false };

  return (
    <>
      <div className="people-tools">
        <SearchField
          value={search}
          onValueChange={setSearch}
          placeholder="Search by name, email or phone"
          label="Search people"
          className="people-tools__search"
        />
        <Select label="Show" hideLabel value={role} onChange={(e) => setRole(e.target.value)} options={ROLE_FILTERS} className="people-tools__role" />
      </div>
      <p className="people-count" aria-live="polite">
        {people.isSuccess ? (total === 1 ? '1 person' : `${total.toLocaleString('en-GB')} people`) : ' '}
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
          <EmptyState
            size="sm"
            icon={WarningCircle}
            title="People didn’t load"
            body={problem(people.error)}
            action={
              <Button size="sm" leadingIcon={ArrowClockwise} onClick={() => void people.refetch()} loading={people.isFetching}>
                Try again
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState
            size="sm"
            icon={UsersThree}
            title={q ? `No one matches “${q}”` : 'No one here yet'}
            body={q ? 'Check the spelling, or search by email or phone number.' : 'Accounts show up here once people sign in.'}
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
                <th scope="col">Role</th>
                <th scope="col">Last seen</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <PersonRow key={p.id} p={p} isSelf={p.id === me?.id} onChange={(change) => setPending({ person: p, change })} />
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

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={dialog?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={confirm} loading={update.isPending}>
              {dialog?.action}
            </Button>
          </>
        }
      >
        <p className="people-dialog">{dialog?.body} They get a notification.</p>
      </Modal>
    </>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────────────────────

function Activity() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const audit = useAudit(true);
  // The newest accounts, so "suspended an account" can say whose (any list already loaded helps too).
  usePeople('', null, true);
  const entries = audit.data?.pages.flatMap((p) => p.items) ?? [];
  const nameOf = (id: string): string | null => {
    if (id === me?.id) return me.displayName ?? null;
    for (const [, data] of qc.getQueriesData<InfiniteData<AdminUserPage, number>>({ queryKey: ADMIN_USERS_KEY })) {
      for (const page of data?.pages ?? []) {
        const found = page.items.find((u) => u.id === id);
        if (found) return found.displayName ?? null;
      }
    }
    return null;
  };
  if (audit.isPending) {
    return (
      <Panel padding="none">
        <div className="people-loading" aria-busy="true" aria-label="Loading activity">
          {[0, 1, 2].map((i) => (
            <div key={i} className="people-loading__row">
              <Skeleton circle width={32} height={32} />
              <Skeleton lines={2} />
            </div>
          ))}
        </div>
      </Panel>
    );
  }
  if (audit.isError) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={WarningCircle}
          title="Activity didn’t load"
          body={problem(audit.error)}
          action={
            <Button size="sm" leadingIcon={ArrowClockwise} onClick={() => void audit.refetch()} loading={audit.isFetching}>
              Try again
            </Button>
          }
        />
      </Panel>
    );
  }
  if (!entries.length) {
    return (
      <Panel padding="none">
        <EmptyState size="sm" icon={ClockCounterClockwise} title="Nothing yet" body="Role changes, suspensions and moderation show up here." />
      </Panel>
    );
  }
  return (
    <>
      <Panel padding="none">
        <ol role="list" className="people-activity">
          {entries.map((e) => {
            const who = auditActor(e);
            return (
              <li key={e.id} className="people-activity__item">
                <Avatar name={who} size="sm" decorative />
                <p className="people-activity__text">
                  <strong>{who}</strong> {describeAudit(e, nameOf)}
                </p>
                <time className="people-activity__time" dateTime={e.createdAt} title={formatDate(e.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}>
                  {timeAgo(e.createdAt)}
                </time>
              </li>
            );
          })}
        </ol>
      </Panel>
      {audit.hasNextPage ? (
        <div className="people-more">
          <Button onClick={() => void audit.fetchNextPage()} loading={audit.isFetchingNextPage}>
            Show older activity
          </Button>
        </div>
      ) : null}
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'people', label: 'People', icon: UsersThree },
  { id: 'activity', label: 'Activity', icon: ClockCounterClockwise },
];

function PeopleScreen() {
  const [tab, setTab] = useQueryParam('tab', 'people');
  return (
    <Page className="people">
      <PageHeader title="People" description="Find an account, change its role, or suspend it. Every change is logged under Activity." />
      <Tabs idBase="people" tabs={TABS} value={tab} onChange={(id) => setTab(id, { replace: true })} label="People and activity" className="people-tabs" />
      <TabPanel idBase="people" id="people" value={tab} className="people-tabpanel">
        <People />
      </TabPanel>
      <TabPanel idBase="people" id="activity" value={tab} className="people-tabpanel">
        <Activity />
      </TabPanel>
    </Page>
  );
}

export default function PeoplePage() {
  return (
    <RoleGate need="admin" title="People" description="Accounts, roles and the activity log.">
      <PeopleScreen />
    </RoleGate>
  );
}
