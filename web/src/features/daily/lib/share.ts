// Sharing a result: the server writes the text (a grid without spoilers); the web app adds the link and hands it
// to the phone's share sheet, or copies it.
import { appUrl, copyText } from '../../../lib/share';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** The result text with the Daily's address under it. */
export function withLink(share: string, url: string): string {
  return `${share.trimEnd()}\n${url}`;
}

/** The share sheet on touch screens that have one; the clipboard everywhere else. */
export async function shareResult(share: string): Promise<ShareOutcome> {
  const text = withLink(share, appUrl('/daily'));
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      /* no share sheet after all: copy instead */
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}
