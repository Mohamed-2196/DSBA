// Keeps this browser's notifications (web push) current on each start: the subscription goes to the API again, tied
// to this session, or ends when another person turned it on here (lib/push.ts, resyncPush). Nothing when push is off.
import { useEffect } from 'react';
import { useAuth } from '../auth';
import { resyncPush } from '../lib/push';

export function PushSync() {
  const { me, status, featureOn } = useAuth();
  const userId = status === 'signed-in' && me ? me.id : null;
  const on = featureOn('push');
  useEffect(() => {
    if (!userId || !on) return;
    void resyncPush(userId).catch(() => undefined); // it is tried again on the next start
  }, [userId, on]);
  return null;
}
