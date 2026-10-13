// /admin/people (admins): find an account, see its roles, suspend or lift a suspension; and the activity log.
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ClockCounterClockwise, Prohibit, UserCheck, UsersThree } from '@phosphor-icons/react';
import { errorMessage } from '../../api/errors';
import type { AdminUser, AdminUserPage } from '../../api/types';
import { Gate, useAuth } from '../../auth';
import { formatPhone } from '../../auth/identifiers';
import { useDebouncedValue, useQueryParam, useToast } from '../../state';
import {
  Avatar, Badge, Button, CohortBadge, ConfirmDialog, EmptyState, Page, PageHeader, Panel, QueryError, SearchField, Select, Skeleton, TabPanel, Tabs, formatDate, timeAgo,
} from '../../ui';
import { auditActor, describeAudit } from './audit';
import { ADMIN_USERS_KEY } from '../access/public';
import { useAudit, usePeople, useUpdatePerson } from './api';
import './PeoplePage.css';

const ROLE_FILTERS = [{ value: '', label: 'Everyone' }];
type Change = { status: 'active' | 'suspended' };
type Pending = { person: AdminUser; change: Change } | null;


function displayName(p: AdminUser): string {
  return p.displayName || 'No name yet';
}

// ── People ───────────────────────────────────────────────────────────────────────────────────

function PersonRow({ p, isSelf, onStatus }: { p: AdminUser; isSelf: boolean; onStatus: (status: 'active' | 'suspended') => void }) {
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
        <span className="people-role">
          <span className="people-role__name">{p.roles.map((r) => r.name).join(', ')}</span>
        </span>
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

function People() {
  const { me } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const people = usePeople(q, role || null, true);
  const update = useUpdatePerson();
  const [pending, setPendingState] = useState<Pending>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const setPending = (next: Pending) => {
    setProblem(null);
    setPendingState(next);
  };

  const list = useMemo(() => people.data?.pages.flatMap((p) => p.items) ?? [], [people.data]);
  const total = people.data?.pages[0]?.total ?? 0;

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
          <QueryError error={people.error} title="People didn’t load" onRetry={() => void people.refetch()} retrying={people.isFetching} size="sm" panel={false} />
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
                <PersonRow
                  key={p.id}
                  p={p}
                  isSelf={p.id === me?.id}
                  onStatus={(status) => setPending({ person: p, change: { status } })}
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
            ? 'They can still sign in and read, but can’t post, upload or react until you lift it. Anything their roles allow is off while they’re suspended too. They get a notification.'
            : 'They can post, upload and react again. They get a notification.'
        }
        confirmLabel={suspending ? 'Suspend' : 'Lift suspension'}
        tone={suspending ? 'danger' : 'primary'}
        busy={update.isPending}
        error={pending ? problem : null}
        onConfirm={() => pending && apply(pending.person, pending.change, () => setPending(null))}
        onClose={() => setPending(null)}
      />
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
    return <QueryError error={audit.error} title="Activity didn’t load" onRetry={() => void audit.refetch()} retrying={audit.isFetching} size="sm" />;
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
      <PageHeader title="People" description="Find an account, see its roles, or suspend it. Every change is logged under Activity." />
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
    <Gate title="People" description="Accounts, roles and the activity log." admin>
      <PeopleScreen />
    </Gate>
  );
}
