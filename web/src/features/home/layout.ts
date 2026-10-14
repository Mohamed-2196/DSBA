// Home's layout for the person using the app: the account's homeBlocks when signed in, this browser's for a guest.
import { useCallback, useMemo } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth, useUpdatePreferences } from '../../auth';
import { useLocalStorage, useToast } from '../../state';
import { GUEST_DEFAULT, STUDENT_DEFAULT, layoutOf, normalizeBlocks, withUnavailable, type HomeBlock, type Layout } from './blocks';

export const GUEST_LAYOUT_KEY = 'hub.homeBlocks';

export interface HomeLayout extends Layout {
  /** The person changed the default layout. */
  custom: boolean;
  /** Save the blocks shown, in order; null goes back to the default. */
  save: (shown: HomeBlock[] | null) => void;
}

export function useHomeLayout(available: ReadonlySet<HomeBlock>): HomeLayout {
  const { me, status } = useAuth();
  const account = status === 'signed-in' && me ? me : null;
  const [guestRaw, setGuestRaw] = useLocalStorage<unknown>(GUEST_LAYOUT_KEY, null);
  const { mutate } = useUpdatePreferences();
  const { push } = useToast();
  const accountBlocks = account?.preferences.homeBlocks ?? null;
  const saved = useMemo(() => (account ? accountBlocks : normalizeBlocks(guestRaw)), [account, accountBlocks, guestRaw]);
  const defaults = account ? STUDENT_DEFAULT : GUEST_DEFAULT;
  const layout = useMemo(() => layoutOf(saved, defaults, available), [saved, defaults, available]);

  const save = useCallback(
    (shown: HomeBlock[] | null) => {
      const next = shown === null ? null : withUnavailable(shown, saved, defaults, available);
      if (account) {
        mutate({ homeBlocks: next }, { onError: (e) => push({ tone: 'alert', title: 'Your Home wasn’t saved', body: errorMessage(e, 'Try again in a moment.') }) });
      } else setGuestRaw(next ?? undefined);
    },
    [account, saved, defaults, available, mutate, push, setGuestRaw],
  );

  return { ...layout, custom: saved !== null, save };
}
