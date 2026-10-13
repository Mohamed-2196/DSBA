import { useCallback } from 'react';
import { useToast } from '../state';
import { copyText } from './share';

/**
 * Copies a link and says how it went: `copied` as the success line ("Anyone can open this file with it."), and the
 * same failure everywhere, with the link to copy by hand.
 */
export function useCopyLink(): (url: string, copied: string) => Promise<void> {
  const { push } = useToast();
  return useCallback(
    async (url, copied) => {
      if (await copyText(url)) push({ tone: 'success', title: 'Link copied', body: copied });
      else push({ tone: 'alert', title: 'Couldn’t copy the link', body: `Select it and copy it yourself: ${url}` });
    },
    [push],
  );
}
