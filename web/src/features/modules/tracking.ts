// Whether lesson progress is kept: opt in. Signed in, it is the account's preference (trackProgress), and the API
// keeps nothing until it is on. A guest's choice stays in this browser. Off: no watched marks, no resume, no
// progress bars, and nothing new is recorded; the API keeps what was saved before hidden until it is on again.
import { useCallback, useMemo } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth, useUpdatePreferences } from '../../auth';
import { useLocalStorage, useToast } from '../../state';

export const GUEST_TRACKING_KEY = 'hub.trackProgress';
/** Set once the lesson page's "Keep track of what you've watched?" was answered, either way. */
export const OFFER_KEY = 'hub.progressOffer';

export interface Tracking {
  on: boolean;
  /** False while sign-in status is loading. */
  ready: boolean;
  /** Signed in or a guest: whose choice it is. */
  mode: 'guest' | 'account';
  set: (on: boolean) => void;
}

export function useTracking(): Tracking {
  const { me, status } = useAuth();
  const [guestOn, setGuestOn] = useLocalStorage<boolean>(GUEST_TRACKING_KEY, false);
  const update = useUpdatePreferences();
  const { push } = useToast();
  const { mutate } = update;
  const account = status === 'signed-in' && !!me;
  const on = account ? me.preferences.trackProgress : guestOn === true;
  const set = useCallback(
    (next: boolean) => {
      if (account) {
        mutate(
          { trackProgress: next },
          {
            onError: (e) =>
              push({
                tone: 'alert',
                title: 'Your choice wasn’t saved',
                body: errorMessage(e, 'Try again in a moment.'),
              }),
          },
        );
      } else setGuestOn(next ? true : undefined);
    },
    [account, mutate, push, setGuestOn],
  );
  return useMemo(
    () => ({ on, ready: status !== 'loading', mode: account ? ('account' as const) : ('guest' as const), set }),
    [on, status, account, set],
  );
}
