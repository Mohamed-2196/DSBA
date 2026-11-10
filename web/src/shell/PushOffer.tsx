// Offers notifications once, the first time the installed app opens signed in on a device that hasn't been asked
// yet (lib/push.ts, offerPush): "Turn on" asks the device, "Not now" (or closing it) leaves them off. It never shows
// again on this device; Your account's "On this device" stays the way to change it.
import { useEffect } from 'react';
import { errorMessage } from '../api/errors';
import { useAuth } from '../auth';
import { PushRefused, blockedNote, notePushOffered, offerPushHere, turnPushOn } from '../lib/push';
import { useInstall } from '../lib/pwa';
import { useToast } from '../state';

export function PushOffer() {
  const { me, status, featureOn } = useAuth();
  const { installed } = useInstall();
  const { push } = useToast();
  const userId = status === 'signed-in' && me ? me.id : null;
  const on = featureOn('push');

  useEffect(() => {
    if (!userId || !on || !offerPushHere(installed)) return;
    notePushOffered();
    const turnOn = () =>
      turnPushOn(userId).then(
        () =>
          push({
            tone: 'success',
            title: 'Notifications are on',
            body: 'Replies to you come to this device. Choose others in Your account.',
          }),
        (err: unknown) => {
          if (err instanceof PushRefused)
            push(
              err.blocked
                ? { tone: 'info', title: 'Notifications stay off', body: blockedNote(true), duration: 0 }
                : {
                    tone: 'info',
                    title: 'Notifications stay off',
                    body: 'You can turn them on any time in Your account.',
                  },
            );
          else push({ tone: 'alert', title: 'Notifications didn’t turn on', body: errorMessage(err) });
        },
      );
    push({
      title: 'Get a notification when someone replies to you?',
      body: 'You can change it any time in Your account.',
      duration: 0,
      action: { label: 'Turn on', onClick: () => void turnOn() },
      secondary: { label: 'Not now' },
    });
  }, [userId, on, installed, push]);
  return null;
}
