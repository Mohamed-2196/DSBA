import { useCallback } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { useStarItem } from './api';
import type { LibraryItem } from './types';

/** toggle(item): star or unstar (optimistic); guests are asked to sign in first. A suspended account can't star
 *  (the API answers 403, student test ST-8): it is told so at once, without a star that flickers on and off. */
export function useStar(): (item: Pick<LibraryItem, 'id' | 'starred'>) => void {
  const { me, requireAuth } = useAuth();
  const { push } = useToast();
  const { mutate } = useStarItem();
  const suspended = me?.status === 'suspended';
  return useCallback(
    (item) => {
      const starred = !item.starred;
      const failed = starred ? 'Couldn’t star this file' : 'Couldn’t remove the star';
      if (suspended) {
        push({ title: failed, body: 'Your account is suspended. Contact a student rep.', tone: 'alert' });
        return;
      }
      const run = () => mutate({ id: item.id, starred }, { onError: (e) => push({ title: failed, body: errorMessage(e), tone: 'alert' }) });
      if (!requireAuth('Sign in to star files', run)) return;
      run();
    },
    [mutate, push, requireAuth, suspended],
  );
}
