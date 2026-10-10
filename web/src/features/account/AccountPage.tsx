// /account: profile, sign-in methods, emails, signed-in devices, data export and account deletion.
import { useEffect, useState, type FormEvent } from 'react';
import {
  DeviceMobile, DeviceTablet, DownloadSimple, EnvelopeSimple, Monitor, Phone, SignIn, SignOut, Trash, UserCircle, WarningCircle,
} from '@phosphor-icons/react';
import { ApiError, errorMessage } from '../../api/errors';
import type { Me, SessionInfo } from '../../api/types';
import { useAuth } from '../../auth';
import { CohortPicker, type CohortChoice } from '../../auth/CohortPicker';
import { formatPhone } from '../../auth/identifiers';
import { PageLoader } from '../../shell/PageLoader';
import { useToast } from '../../state';
import {
  Badge, Button, Divider, EmptyState, Modal, Page, PageHeader, PageSection, Panel, SectionHeader, Skeleton, Switch, TextField, formatDate, timeAgo,
} from '../../ui';
import { downloadAccountData, useRemoveIdentifier, useRevokeSessions, useSessions, useUpdateMe, useUpdatePreferences, type IdentifierKind } from './api';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { describeDevice } from './device';
import { IdentifierDialog } from './IdentifierDialog';
import './AccountPage.css';

function problem(e: unknown): string {
  if (e instanceof ApiError && e.code === 'network') return 'Couldn’t reach the Hub. Check your connection and try again.';
  return errorMessage(e);
}

// ── Profile ──────────────────────────────────────────────────────────────────────────────────

function ProfileSection({ me }: { me: Me }) {
  const { push } = useToast();
  const update = useUpdateMe();
  const savedCohort: CohortChoice = me.year ?? (me.needsProfile ? null : 'none');
  const [name, setName] = useState(me.displayName ?? '');
  const [cohort, setCohort] = useState<CohortChoice>(savedCohort);
  const [nameError, setNameError] = useState<string | null>(null);
  const [cohortError, setCohortError] = useState<string | null>(null);

  useEffect(() => {
    setName(me.displayName ?? '');
    setCohort(me.year ?? (me.needsProfile ? null : 'none'));
  }, [me.displayName, me.year, me.needsProfile]);

  const dirty = name.trim() !== (me.displayName ?? '') || cohort !== savedCohort;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const displayName = name.trim().replace(/\s+/g, ' ');
    const nErr = displayName.length < 2 ? 'Enter your name (at least 2 characters).' : displayName.length > 40 ? 'Keep it to 40 characters.' : null;
    const cErr = cohort === null ? 'Choose your year, or “Not a current student”.' : null;
    setNameError(nErr);
    setCohortError(cErr);
    if (nErr || cErr) return;
    update.mutate(
      { displayName, year: cohort === 'none' ? null : cohort },
      {
        onSuccess: () => push({ tone: 'success', title: 'Profile saved' }),
        onError: (err) => {
          if (err instanceof ApiError && err.fields.displayName) setNameError(err.fields.displayName);
          else push({ tone: 'alert', title: 'Your profile wasn’t saved', body: problem(err) });
        },
      },
    );
  };

  return (
    <form className="acct-form" onSubmit={onSubmit} noValidate>
      <TextField
        label="Display name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (nameError) setNameError(null);
        }}
        error={nameError}
        hint="Your name as classmates know it. It shows next to your posts and uploads."
        autoComplete="name"
        maxLength={40}
        disabled={me.status === 'suspended'}
      />
      <CohortPicker
        value={cohort}
        onChange={(v) => {
          setCohort(v);
          setCohortError(null);
        }}
        error={cohortError}
        hint="The Hub shows your year’s modules and exams first."
      />
      <div className="acct-form__actions">
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

// ── Sign-in methods ──────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<IdentifierKind, string> = { email: 'Email address', phone: 'Phone number' };

function SignInMethods({ me }: { me: Me }) {
  const { push } = useToast();
  const remove = useRemoveIdentifier();
  const [editing, setEditing] = useState<IdentifierKind | null>(null);
  const [removing, setRemoving] = useState<IdentifierKind | null>(null);
  const [lastEdited, setLastEdited] = useState<IdentifierKind>('email');
  const value = (kind: IdentifierKind) => (kind === 'email' ? me.email : me.phone ? formatPhone(me.phone) : null);
  const both = !!me.email && !!me.phone;

  const row = (kind: IdentifierKind) => {
    const v = value(kind);
    const Icon = kind === 'email' ? EnvelopeSimple : Phone;
    return (
      <li key={kind} className="acct-row">
        <span className="acct-row__icon" aria-hidden="true">
          <Icon />
        </span>
        <span className="acct-row__text">
          <span className="acct-row__label">{KIND_LABEL[kind]}</span>
          <span className={v ? 'acct-row__value' : 'acct-row__value is-empty'}>{v ?? 'Not added'}</span>
        </span>
        <span className="acct-row__actions">
          {v ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLastEdited(kind);
                  setEditing(kind);
                }}
                aria-label={`Change your ${kind === 'email' ? 'email address' : 'phone number'}`}
              >
                Change
              </Button>
              {both ? (
                <Button size="sm" variant="ghost" onClick={() => setRemoving(kind)} aria-label={`Remove your ${kind === 'email' ? 'email address' : 'phone number'}`}>
                  Remove
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setLastEdited(kind);
                setEditing(kind);
              }}
            >
              {kind === 'email' ? 'Add email' : 'Add phone'}
            </Button>
          )}
        </span>
      </li>
    );
  };

  const other = removing === 'email' ? 'phone' : 'email';
  const otherValue = removing ? value(other) : null;

  return (
    <>
      <Panel padding="none">
        <ul role="list" className="acct-list">
          {row('email')}
          {row('phone')}
        </ul>
      </Panel>
      <p className="acct-note">{both ? 'Sign in with either one.' : 'Add the other one too, so you can still sign in if you lose access to this one.'}</p>
      <IdentifierDialog kind={editing} current={editing ? value(editing) : value(lastEdited)} onClose={() => setEditing(null)} />
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove your ${removing === 'phone' ? 'phone number' : 'email address'}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (!removing) return;
                remove.mutate(removing, {
                  onSuccess: () => {
                    push({
                      tone: 'success',
                      title: removing === 'phone' ? 'Phone number removed' : 'Email address removed',
                      body: 'To be safe, your other devices were signed out.',
                    });
                    setRemoving(null);
                  },
                  onError: (err) => push({ tone: 'alert', title: 'Nothing was removed', body: problem(err) }),
                });
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="acct-dialog-text">
          You’ll sign in with your {other === 'email' ? 'email address' : 'phone number'}
          {otherValue ? (
            <>
              , <strong>{otherValue}</strong>,
            </>
          ) : null}{' '}
          from now on. Your other devices will be signed out.
        </p>
      </Modal>
    </>
  );
}

// ── Emails ───────────────────────────────────────────────────────────────────────────────────

function EmailPreferences({ me }: { me: Me }) {
  const { push } = useToast();
  const update = useUpdatePreferences();
  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, { onError: (err) => push({ tone: 'alert', title: 'Your choice wasn’t saved', body: problem(err) }) });
  return (
    <Panel className="acct-switches">
      <Switch
        label="Replies and reviews"
        description="When someone replies to you, accepts your answer, or a student rep reviews your upload."
        checked={me.preferences.emailNotifications}
        onChange={(on) => save({ emailNotifications: on })}
      />
      <Divider />
      <Switch
        label="New newsletter issues"
        description="When a new issue of The DSBA Newsletter is out."
        checked={me.preferences.newsletterEmails}
        onChange={(on) => save({ newsletterEmails: on })}
      />
      {!me.email ? <p className="acct-note acct-note--inset">These go to your email address. Add one above to get them.</p> : null}
    </Panel>
  );
}

// ── Devices ──────────────────────────────────────────────────────────────────────────────────

const DEVICE_ICON = { desktop: Monitor, phone: DeviceMobile, tablet: DeviceTablet };

function SessionRow({ s, onSignOut, busy }: { s: SessionInfo; onSignOut: () => void; busy: boolean }) {
  const device = describeDevice(s.userAgent);
  const Icon = DEVICE_ICON[device.kind];
  const seen = s.current ? 'Active now' : s.lastSeenAt ? `Active ${timeAgo(s.lastSeenAt)}` : `Signed in ${timeAgo(s.createdAt)}`;
  return (
    <li className="acct-row">
      <span className="acct-row__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="acct-row__text">
        <span className="acct-row__label">
          {device.name}
          {s.current ? (
            <Badge tone="signal" size="sm">
              This device
            </Badge>
          ) : null}
        </span>
        <span className="acct-row__value">
          {seen}
          <span aria-hidden="true"> · </span>
          <span className="visually-hidden">, </span>
          signed in {formatDate(s.createdAt)}
        </span>
      </span>
      <span className="acct-row__actions">
        {!s.current ? (
          <Button size="sm" variant="ghost" onClick={onSignOut} disabled={busy} aria-label={`Sign out ${device.name}`}>
            Sign out
          </Button>
        ) : null}
      </span>
    </li>
  );
}

function Sessions() {
  const { push } = useToast();
  const sessions = useSessions(true);
  const revoke = useRevokeSessions();
  // This device first, then the others as the server orders them (most recently used first).
  const list = [...(sessions.data ?? [])].sort((a, b) => Number(b.current) - Number(a.current));
  const others = list.filter((s) => !s.current);

  const signOut = (ids: string[], many: boolean) =>
    revoke.mutate(ids, {
      onSuccess: () => push({ tone: 'success', title: many ? 'Signed out of your other devices' : 'That device is signed out' }),
      onError: (err) => push({ tone: 'alert', title: 'Couldn’t sign that out', body: problem(err) }),
    });

  return (
    <>
      <SectionHeader
        id="acct-devices"
        title="Where you’re signed in"
        description="Sign out anywhere you don’t recognise, like a lab computer you forgot to sign out of."
        action={
          others.length > 0 ? (
            <Button size="sm" variant="ghost" leadingIcon={SignOut} onClick={() => signOut(others.map((s) => s.id), true)} loading={revoke.isPending}>
              Sign out other devices
            </Button>
          ) : null
        }
      />
      <Panel padding="none">
        {sessions.isPending ? (
          <ul role="list" className="acct-list" aria-busy="true" aria-label="Loading devices">
            {[0, 1].map((i) => (
              <li key={i} className="acct-row">
                <Skeleton width={36} height={36} radius="var(--r-control)" />
                <Skeleton lines={2} className="acct-row__text" />
              </li>
            ))}
          </ul>
        ) : sessions.isError ? (
          <EmptyState
            size="sm"
            icon={WarningCircle}
            title="Your devices didn’t load"
            body={problem(sessions.error)}
            action={
              <Button size="sm" onClick={() => void sessions.refetch()} loading={sessions.isFetching}>
                Try again
              </Button>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState size="sm" icon={Monitor} title="No devices" body="Devices you sign in on show up here." />
        ) : (
          <ul role="list" className="acct-list">
            {list.map((s) => (
              <SessionRow key={s.id} s={s} onSignOut={() => signOut([s.id], false)} busy={revoke.isPending} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────────────────────

function YourData() {
  const { push } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      await downloadAccountData();
    } catch (err) {
      push({ tone: 'alert', title: 'Your data didn’t download', body: problem(err) });
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Panel className="acct-data">
      <div className="acct-data__item">
        <div className="acct-data__text">
          <h3 className="acct-data__title">Download your data</h3>
          <p>Everything the Hub keeps about you, as a JSON file: your profile, devices, posts, uploads, stars, reactions, progress and notifications.</p>
        </div>
        <Button leadingIcon={DownloadSimple} onClick={() => void download()} loading={downloading}>
          Download
        </Button>
      </div>
      <Divider />
      <div className="acct-data__item">
        <div className="acct-data__text">
          <h3 className="acct-data__title">Delete your account</h3>
          <p>Your personal data goes for good. Your posts stay, shown as from a deleted user.</p>
        </div>
        <Button variant="danger" leadingIcon={Trash} onClick={() => setDeleting(true)}>
          Delete account
        </Button>
      </div>
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </Panel>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { me, status, openSignIn } = useAuth();

  if (status === 'loading') return <PageLoader />;
  if (!me) {
    return (
      <Page width="narrow">
        <PageHeader title="Your account" description="Your profile, how you sign in, and your data." />
        <Panel padding="none">
          <EmptyState
            icon={UserCircle}
            title="Sign in to see your account"
            body="Your profile, how you sign in, your devices and your data are here once you’re signed in."
            action={
              <Button variant="primary" leadingIcon={SignIn} onClick={() => openSignIn({ reason: 'Sign in to see your account' })}>
                Sign in
              </Button>
            }
          />
        </Panel>
      </Page>
    );
  }

  return (
    <Page width="narrow" className="acct">
      <PageHeader title="Your account" description="Your profile, how you sign in, and your data." />
      {me.status === 'suspended' ? (
        <p className="acct-banner" role="status">
          <WarningCircle aria-hidden="true" weight="fill" />
          <span>Your account is suspended. You can still sign in and read, but you can’t post, upload or react. Contact a student rep.</span>
        </p>
      ) : null}

      <PageSection aria-labelledby="acct-profile">
        <SectionHeader id="acct-profile" title="Profile" description="How classmates see you on the forum and in the library." />
        <Panel>
          <ProfileSection me={me} />
        </Panel>
      </PageSection>

      <PageSection aria-labelledby="acct-signin">
        <SectionHeader id="acct-signin" title="How you sign in" description="We send a 6-digit code to one of these each time you sign in." />
        <SignInMethods me={me} />
      </PageSection>

      <PageSection aria-labelledby="acct-emails">
        <SectionHeader id="acct-emails" title="Emails" description="Notifications always show in the Hub. Choose what we also email you." />
        <EmailPreferences me={me} />
      </PageSection>

      <PageSection aria-labelledby="acct-devices">
        <Sessions />
      </PageSection>

      <PageSection aria-labelledby="acct-data">
        <SectionHeader id="acct-data" title="Your data" />
        <YourData />
      </PageSection>
    </Page>
  );
}
