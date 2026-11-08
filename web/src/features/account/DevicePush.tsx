// "Notifications on this device" on Your account: turning web push on or off for this browser (lib/push.ts), and
// which notifications come to every device where it is on. Only replies to your own posts start on. The browser's
// permission is asked only when the switch is tapped; on an iPhone or iPad outside the Home Screen app, the steps to
// add it come first.
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { Me } from '../../api/types';
import { useAuth, useUpdatePreferences, type Feature } from '../../auth';
import {
  PushRefused,
  browserPushSupport,
  devicePushOn,
  pushPermission,
  turnPushOff,
  turnPushOn,
  type PushSupport,
} from '../../lib/push';
import { useToast } from '../../state';
import { Divider, Panel, Switch } from '../../ui';

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

const HOME_SCREEN_STEPS = [
  'Open the Hub in Safari.',
  'Tap Share, then Add to Home Screen, then Add.',
  'Open the Hub from your Home Screen and turn this on there.',
];

function ThisDevice({ me, support }: { me: Me; support: PushSupport }) {
  const { push } = useToast();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(() => support === 'yes' && pushPermission() === 'denied');

  useEffect(() => {
    if (support !== 'yes') return;
    let live = true;
    devicePushOn(me.id)
      .then((v) => live && setOn(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [me.id, support]);

  if (support === 'home-screen') {
    return (
      <div className="acct-push__steps">
        <p className="acct-push__lead">Add the Hub to your Home Screen first</p>
        <p className="acct-note">On an iPhone or iPad, notifications only come to the Hub on your Home Screen.</p>
        <ol className="acct-push__list">
          {HOME_SCREEN_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
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
        label="Notifications on this device"
        description="Show the Hub’s notifications on this device, even when the Hub is closed."
        checked={on}
        disabled={busy}
        onChange={(next) => void change(next)}
        data-hub="account-push-device"
      />
      {blocked ? (
        <p className="acct-note acct-push__blocked" role="status">
          Notifications are blocked for the Hub in this browser. Allow them in the browser’s settings for this site,
          then turn this on.
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
    <Panel className="acct-switches">
      <div className="acct-switches__item">
        <ThisDevice me={me} support={support} />
      </div>
      <p className="acct-note acct-note--inset acct-push__heading">What comes to every device where they’re on:</p>
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
  );
}
