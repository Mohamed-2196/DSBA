// "Notifications on your devices" on Your account: a panel for this browser alone, with web push on or off
// (lib/push.ts), then which notifications come to every device where it is on. Only replies to your own posts start
// on. The browser's permission is asked only when the switch is tapped (or by the installed app's one-time offer,
// shell/PushOffer.tsx); where the browser allows them already, the device turns on by itself on start
// (shell/PushSync.tsx). On an iPhone or iPad outside the Home Screen app, the steps to add it come first. While the
// browser blocks the Hub's notifications, the switch is off limits.
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { Me } from '../../api/types';
import { useAuth, useUpdatePreferences, type Feature } from '../../auth';
import {
  PushRefused,
  blockedNote,
  browserPushSupport,
  devicePushOn,
  onPushSynced,
  pushPermission,
  turnPushOff,
  turnPushOn,
  type PushSupport,
} from '../../lib/push';
import { useInstall } from '../../lib/pwa';
import { IphoneSteps } from '../../shell/InstallSteps';
import { useToast } from '../../state';
import { Divider, Panel, SectionHeader, Switch } from '../../ui';

type PushChoice =
  | 'pushReplies'
  | 'pushFollowed'
  | 'pushAnswerAccepted'
  | 'pushUploadReviews'
  | 'pushNewIssues'
  | 'pushDateChanges'
  | 'pushReminders';

/** The email choices' groups (EmailPreferences), with replies to your own posts apart, and reminders. */
const PUSH_CHOICES: { key: PushChoice; label: string; description: string; feature: Feature; also?: Feature }[] = [
  {
    key: 'pushReplies',
    label: 'Replies to you',
    description: 'When someone replies to your thread or to one of your replies, or asks you a question as a senior.',
    feature: 'forum',
  },
  {
    key: 'pushFollowed',
    label: 'Threads you follow',
    description: 'A new reply, or an accepted answer, in a thread you follow.',
    feature: 'forum.follow',
  },
  {
    key: 'pushAnswerAccepted',
    label: 'Accepted answers',
    description: 'When the person who asked marks your reply as the answer.',
    feature: 'forum',
  },
  {
    key: 'pushUploadReviews',
    label: 'Your uploads',
    description: 'When a student rep publishes a file you uploaded, or decides not to.',
    feature: 'library',
  },
  {
    key: 'pushNewIssues',
    label: 'New newsletter issues',
    description: 'When a new issue of The DSBA Newsletter is out.',
    feature: 'newsletter',
  },
  {
    key: 'pushDateChanges',
    label: 'Date changes',
    description: 'When an exam, mock or deadline of your year moves, or its date is confirmed.',
    feature: 'calendar',
  },
  {
    key: 'pushReminders',
    label: 'Reminders',
    description: 'The reminders you set for your own events and your board’s cards.',
    feature: 'calendar',
    also: 'board',
  },
];

function ThisDevice({ me, support }: { me: Me; support: PushSupport }) {
  const { push } = useToast();
  const { installed } = useInstall();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(() => support === 'yes' && pushPermission() === 'denied');

  useEffect(() => {
    if (support !== 'yes') return;
    let live = true;
    const read = () =>
      void devicePushOn(me.id)
        .then((v) => live && setOn(v))
        .catch(() => undefined);
    read();
    const stop = onPushSynced(read); // the start's sign-up may finish after this panel first reads it
    return () => {
      live = false;
      stop();
    };
  }, [me.id, support]);

  // Allowing them again in the browser's (or the device's) settings brings the switch back without a reload.
  useEffect(() => {
    if (support !== 'yes' || !navigator.permissions) return;
    let status: PermissionStatus | null = null;
    let live = true;
    const read = () => setBlocked(pushPermission() === 'denied');
    navigator.permissions
      .query({ name: 'notifications' })
      .then((s) => {
        if (!live) return;
        status = s;
        s.addEventListener('change', read);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      status?.removeEventListener('change', read);
    };
  }, [support]);

  if (support === 'home-screen') {
    return (
      <div className="acct-push__steps">
        <p className="acct-push__lead">Add the Hub to your Home Screen first</p>
        <p className="acct-note">On an iPhone or iPad, notifications only come to the Hub on your Home Screen.</p>
        <IphoneSteps
          className="acct-push__list"
          last="Open the Hub from your Home Screen, come back here and turn it on."
        />
      </div>
    );
  }
  if (support === 'no') {
    return <p className="acct-note acct-note--inset">This browser can’t show the Hub’s notifications.</p>;
  }

  const change = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) await turnPushOn(me.id);
      else await turnPushOff();
      setOn(next);
      setBlocked(false);
    } catch (err) {
      if (err instanceof PushRefused) {
        setBlocked(err.blocked);
        if (!err.blocked)
          push({ tone: 'info', title: 'Notifications stay off', body: 'You can turn them on any time.' });
      } else {
        push({
          tone: 'alert',
          title: next ? 'Notifications didn’t turn on' : 'Notifications didn’t turn off',
          body: errorMessage(err),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Switch
        label="On this device"
        description={`Only this ${installed ? 'device' : 'browser'}. Turn it on again on your other devices.`}
        checked={on}
        disabled={busy || blocked}
        onChange={(next) => void change(next)}
        data-hub="account-push-device"
      />
      {blocked ? (
        <p className="acct-note acct-push__blocked" role="status">
          {blockedNote(installed)}
        </p>
      ) : null}
    </>
  );
}

export function DevicePush({ me }: { me: Me }) {
  const { featureOn } = useAuth();
  const update = useUpdatePreferences();
  const { push } = useToast();
  const [support] = useState(browserPushSupport);
  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (err) => push({ tone: 'alert', title: 'Your choice wasn’t saved', body: errorMessage(err) }),
    });
  const choices = PUSH_CHOICES.filter((c) => featureOn(c.feature) || (c.also !== undefined && featureOn(c.also)));
  return (
    <>
      <SectionHeader
        id="acct-push"
        title="Notifications on your devices"
        description="They show on your phone or computer even when the Hub is closed. Turn them on for each device."
      />
      <Panel>
        <ThisDevice me={me} support={support} />
      </Panel>
      <div className="acct-push__kinds">
        <h3 className="acct-push__title">Which ones come to your devices</h3>
        <p className="acct-note acct-note--inset">To every device where you’ve turned them on.</p>
      </div>
      <Panel className="acct-switches">
        {choices.map((c, i) => (
          <div key={c.key} className="acct-switches__item">
            {i > 0 ? <Divider /> : null}
            <Switch
              label={c.label}
              description={c.description}
              checked={me.preferences[c.key] ?? false}
              onChange={(on) => save({ [c.key]: on })}
            />
          </div>
        ))}
      </Panel>
    </>
  );
}
