import { useCallback } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { useStarItem } from './api';
import type { LibraryItem } from './types';

/** toggle(item): star or unstar (optimistic); guests are asked to sign in first. */
export function useStar(): (item: Pick<LibraryItem, 'id' | 'starred'>) => void {
  const { requireAuth } = useAuth();
  const { push } = useToast();
  const { mutate } = useStarItem();
  return useCallback(
    (item) => {
      const starred = !item.starred;
      const run = () =>
        mutate(
          { id: item.id, starred },
          {
            onError: (e) =>
              push({ title: starred ? 'Couldn’t star this file' : 'Couldn’t remove the star', body: errorMessage(e), tone: 'alert' }),
          },
        );
      if (!requireAuth('Sign in to star files', run)) return;
      run();
    },
    [mutate, push, requireAuth],
  );
}
