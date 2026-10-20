// /account: profile, sign-in methods, emails, signed-in devices, data export and account deletion.
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, errorMessage, placeFieldErrors, unplacedMessage } from '../../api/errors';
import type { Me, SessionInfo } from '../../api/types';
import { useAuth, useUpdatePreferences, type Feature } from '../../auth';
import { CohortPicker, type CohortChoice } from '../../auth/CohortPicker';
import { formatPhone } from '../../auth/identifiers';
import { PageLoader } from '../../shell/PageLoader';
import { useToast } from '../../state';
import { ModulesGate } from '../../state/ModulesProvider';
import {
  Badge,
  Button,
  ConfirmDialog,
  Divider,
  EmptyState,
  Icon,
  Page,
  PageHeader,
  PageSection,
  Panel,
  QueryError,
  SectionHeader,
  Skeleton,
  Switch,
  TextField,
  formatDate,
  glyph,
  timeAgo,
} from '../../ui';
import {
  downloadAccountData,
  useRemoveIdentifier,
  useRevokeSessions,
  useSessions,
  useUpdateMe,
  type IdentifierKind,
} from './api';
import { SeniorListing } from '../career/public';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { describeDevice } from './device';
import { IdentifierDialog } from './IdentifierDialog';
import { useTracking } from '../modules/public';
import { PapersButton } from '../papers/public';
import './AccountPage.css';

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
    const nErr =
      displayName.length < 2
        ? 'Enter your name (at least 2 characters).'
        : displayName.length > 40
          ? 'Keep it to 40 characters.'
          : null;
    const cErr = cohort === null ? 'Choose your year, or “Not a current student”.' : null;
    setNameError(nErr);
    setCohortError(cErr);
    if (nErr || cErr) return;
    update.mutate(
      { displayName, year: cohort === 'none' ? null : cohort },
      {
        onSuccess: () => push({ tone: 'success', title: 'Profile saved' }),
        onError: (err) => {
          const placed = placeFieldErrors(err instanceof ApiError ? err.fields : {}, ['displayName', 'year']);
          setNameError(placed.fields.displayName ?? null);
          setCohortError(placed.fields.year ?? null);
          const other = unplacedMessage(err, placed);
          if (other) push({ tone: 'alert', title: 'Your profile wasn’t saved', body: other });
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
  const [removing, setRemovingState] = useState<IdentifierKind | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const setRemoving = (kind: IdentifierKind | null) => {
    setRemoveError(null);
    setRemovingState(kind);
  };
  const [lastEdited, setLastEdited] = useState<IdentifierKind>('email');
  const value = (kind: IdentifierKind) => (kind === 'email' ? me.email : me.phone ? formatPhone(me.phone) : null);
  const both = !!me.email && !!me.phone;

  const row = (kind: IdentifierKind) => {
    const v = value(kind);
    const kindGlyph = kind === 'email' ? glyph.mail : glyph.phone;
    return (
      <li key={kind} className="acct-row">
        <span className="acct-row__icon" aria-hidden="true">
          <Icon glyph={kindGlyph} />
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoving(kind)}
                  aria-label={`Remove your ${kind === 'email' ? 'email address' : 'phone number'}`}
                >
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
      <p className="acct-note">
        {both
          ? 'Sign in with either one.'
          : 'Add the other one too, so you can still sign in if you lose access to this one.'}{' '}
        To change or remove one, we may first send a code to confirm it’s you.
      </p>
      <IdentifierDialog
        kind={editing}
        current={editing ? value(editing) : value(lastEdited)}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove your ${removing === 'phone' ? 'phone number' : 'email address'}?`}
        confirmLabel="Remove"
        tone="danger"
        busy={remove.isPending}
        error={removeError}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          setRemoveError(null);
          remove.mutate(removing, {
            onSuccess: () => {
              push({
                tone: 'success',
                title: removing === 'phone' ? 'Phone number removed' : 'Email address removed',
                body: 'To be safe, your other devices were signed out.',
              });
              setRemoving(null);
            },
            onError: (err) => setRemoveError(errorMessage(err)),
          });
        }}
        body={
          <p>
            You’ll sign in with your {other === 'email' ? 'email address' : 'phone number'}
            {otherValue ? (
              <>
                , <strong>{otherValue}</strong>,
              </>
            ) : null}{' '}
            from now on. Your other devices will be signed out.
          </p>
        }
      />
    </>
  );
}

// ── Emails ───────────────────────────────────────────────────────────────────────────────────

type EmailSwitch =
  | 'emailReplies'
  | 'emailAnswerAccepted'
  | 'emailUploadReviews'
  | 'emailNewIssues'
  | 'emailDateChanges'
  | 'emailWeeklySummary';

/** One switch per kind of email (decision D1); the notification in the Hub shows whatever they say. The Sunday
 *  summary is an email of its own, off until you turn it on, and only while its feature is on. */
const EMAIL_SWITCHES: { key: EmailSwitch; label: string; description: string; feature?: Feature }[] = [
  {
    key: 'emailReplies',
    label: 'Replies',
    description:
      'When someone replies to your thread, to one of your replies or in a thread you follow, or asks you a question as a senior.',
  },
  {
    key: 'emailAnswerAccepted',
    label: 'Accepted answers',
    description: 'When the person who asked marks your reply as the answer, or a thread you follow gets one.',
  },
  {
    key: 'emailUploadReviews',
    label: 'Your uploads',
    description: 'When a student rep publishes a file you uploaded, or decides not to.',
  },
  {
    key: 'emailNewIssues',
    label: 'New newsletter issues',
    description: 'When a new issue of The DSBA Newsletter is out.',
  },
  {
    key: 'emailDateChanges',
    label: 'Date changes',
    description: 'When an exam, mock or deadline of your year moves, or its date is confirmed.',
  },
  {
    key: 'emailWeeklySummary',
    label: 'Sunday summary',
    description: 'Each Sunday morning: your year’s exams and deadlines, new files, open questions and the newsletter.',
    feature: 'summary',
  },
];

function EmailPreferences({ me }: { me: Me }) {
  const { featureOn } = useAuth();
  const { push } = useToast();
  const update = useUpdatePreferences();
  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (err) => push({ tone: 'alert', title: 'Your choice wasn’t saved', body: errorMessage(err) }),
    });
  return (
    <Panel className="acct-switches">
      {!me.email ? (
        <p className="acct-note acct-note--inset">These go to your email address. Add one above to get them.</p>
      ) : null}
      {EMAIL_SWITCHES.filter((s) => !s.feature || featureOn(s.feature)).map((s, i) => (
        <div key={s.key} className="acct-switches__item">
          {i > 0 ? <Divider /> : null}
          <Switch
            label={s.label}
            description={s.description}
            checked={me.preferences[s.key]}
            onChange={(on) => save({ [s.key]: on })}
          />
        </div>
      ))}
      <p className="acct-note acct-note--inset">
        We always email you when how you sign in changes, so you’d know if it wasn’t you.
      </p>
    </Panel>
  );
}

// ── Lesson progress ──────────────────────────────────────────────────────────────────────────

function LessonProgress() {
  const tracking = useTracking();
  return (
    <Panel className="acct-switches">
      <Switch
        label="Track my lesson progress"
        description="Mark lessons as watched and pick up where you left off, on every device. Off: nothing new is saved; what you saved before is kept hidden."
        checked={tracking.on}
        onChange={tracking.set}
        data-hub="account-track-progress"
      />
    </Panel>
  );
}

// ── Devices ──────────────────────────────────────────────────────────────────────────────────

const DEVICE_ICON = { desktop: glyph.monitor, phone: glyph.mobile, tablet: glyph.tablet };

function SessionRow({ s, onSignOut, busy }: { s: SessionInfo; onSignOut: () => void; busy: boolean }) {
  const device = describeDevice(s.userAgent);
  const deviceGlyph = DEVICE_ICON[device.kind];
  const seen = s.current
    ? 'Active now'
    : s.lastSeenAt
      ? `Active ${timeAgo(s.lastSeenAt)}`
      : `Signed in ${timeAgo(s.createdAt)}`;
  return (
    <li className="acct-row">
      <span className="acct-row__icon" aria-hidden="true">
        <Icon glyph={deviceGlyph} />
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
      onSuccess: () =>
        push({ tone: 'success', title: many ? 'Signed out of your other devices' : 'That device is signed out' }),
      onError: (err) => push({ tone: 'alert', title: 'Couldn’t sign that out', body: errorMessage(err) }),
    });

  return (
    <>
      <SectionHeader
        id="acct-devices"
        title="Where you’re signed in"
        description="Sign out anywhere you don’t recognise, like a lab computer you forgot to sign out of."
        action={
          others.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Icon glyph={glyph.signOut} />}
              onClick={() =>
                signOut(
                  others.map((s) => s.id),
                  true,
                )
              }
              loading={revoke.isPending}
            >
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
          <QueryError
            error={sessions.error}
            title="Your devices didn’t load"
            onRetry={() => void sessions.refetch()}
            retrying={sessions.isFetching}
            size="sm"
            panel={false}
          />
        ) : list.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Icon glyph={glyph.monitor} />}
            title="No devices"
            body="Devices you sign in on show up here."
          />
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
      push({ tone: 'alert', title: 'Your data didn’t download', body: errorMessage(err) });
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Panel className="acct-data">
      <div className="acct-data__item">
        <div className="acct-data__text">
          <h3 className="acct-data__title">Download your data</h3>
          <p>
            Everything the Hub keeps about you, as a JSON file: your profile, devices, posts, votes, reports, bug
            reports, uploads, stars, reactions, progress, notifications and the emails we sent you.
          </p>
        </div>
        <Button leadingIcon={<Icon glyph={glyph.download} />} onClick={() => void download()} loading={downloading}>
          Download
        </Button>
      </div>
      <Divider />
      <div className="acct-data__item">
        <div className="acct-data__text">
          <h3 className="acct-data__title">Delete your account</h3>
          <p>Your personal data goes for good. Your posts stay, shown as from a deleted user.</p>
        </div>
        <Button variant="danger" leadingIcon={<Icon glyph={glyph.trash} />} onClick={() => setDeleting(true)}>
          Delete account
        </Button>
      </div>
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </Panel>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const { me, status, openSignIn, featureOn } = useAuth();

  if (status === 'loading') return <PageLoader />;
  if (!me) {
    return (
      <Page width="narrow">
        <PageHeader section="tools" title="Your account" description="Your profile, how you sign in, and your data." />
        <Panel padding="none">
          <EmptyState
            icon={<Icon glyph={glyph.user} />}
            title="Sign in to see your account"
            body="Your profile, how you sign in, your devices and your data are here once you’re signed in."
            action={
              <Button
                variant="primary"
                leadingIcon={<Icon glyph={glyph.signIn} />}
                onClick={() => openSignIn({ reason: 'Sign in to see your account' })}
              >
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
      <PageHeader section="tools" title="Your account" description="Your profile, how you sign in, and your data." />
      {me.status === 'suspended' ? (
        <p className="acct-banner" role="status">
          <Icon glyph={glyph.error} />
          <span>
            Your account is suspended. You can still sign in and read, but you can’t post, upload or react. Contact a
            student rep.
          </span>
        </p>
      ) : null}

      <PageSection aria-labelledby="acct-profile">
        <SectionHeader
          id="acct-profile"
          title="Profile"
          description="How classmates see you on the forum and in the library."
        />
        <Panel>
          <ProfileSection me={me} />
        </Panel>
      </PageSection>

      {featureOn('career.seniors') && me.year === 3 ? (
        <PageSection aria-labelledby="acct-senior">
          <SectionHeader
            id="acct-senior"
            title="Answer as a senior"
            description="List yourself in Career Navigator so Year 1 and 2 students can ask you about what you’ve done."
          />
          <SeniorListing />
        </PageSection>
      ) : null}

      <PageSection aria-labelledby="acct-papers">
        <SectionHeader
          id="acct-papers"
          title="Your modules"
          description="Your option or electives, any module from another year, and your exam zone. Only you see them."
        />
        {/* The page doesn't wait for the module catalogue; picking papers needs it. */}
        <ModulesGate
          fallback={<Skeleton lines={1} />}
          error={(retry, error, retrying) => (
            <QueryError error={error} title="Your modules didn’t load" onRetry={retry} retrying={retrying} size="sm" />
          )}
        >
          <Panel padding="sm" className="acct-papers">
            <PapersButton />
          </Panel>
        </ModulesGate>
      </PageSection>

      <PageSection aria-labelledby="acct-signin">
        <SectionHeader
          id="acct-signin"
          title="How you sign in"
          description="We send a code to one of these each time you sign in."
        />
        <SignInMethods me={me} />
      </PageSection>

      <PageSection aria-labelledby="acct-progress">
        <SectionHeader id="acct-progress" title="Lesson progress" description="Off unless you turn it on." />
        <LessonProgress />
      </PageSection>

      <PageSection aria-labelledby="acct-emails">
        <SectionHeader
          id="acct-emails"
          title="Emails"
          description="Every notification shows in the Hub. Choose which ones we also email you."
        />
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
