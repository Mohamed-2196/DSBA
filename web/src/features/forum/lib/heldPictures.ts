// Forum pictures the Hub's automatic check holds (ThreadDetail.heldImages), as the thread page shares them with the
// pictures in its posts (components/HeldPictures.tsx). Its uploader and moderators see the picture with a line saying
// why the others don't; everyone else sees "Picture being checked" in its place, or that it was removed.
import { createContext, useContext } from 'react';
import type { HeldImage } from '../../../api/types';

export interface Held {
  images: ReadonlyMap<string, HeldImage>;
  moderator: boolean;
}

export const HeldContext = createContext<Held | null>(null);

/** The hold on the picture at `src` (/api/v1/media/<id>), if the check holds it. */
export function useHeldPicture(src: string): { image: HeldImage; moderator: boolean } | null {
  const held = useContext(HeldContext);
  const id = src.split('/').pop() ?? '';
  const image = held?.images.get(id);
  return held && image ? { image, moderator: held.moderator } : null;
}

/** Whether the viewer can open the picture: its uploader until a rep removes it, and moderators always. */
export function canOpen(image: HeldImage, moderator: boolean): boolean {
  return moderator || (image.mine && image.state !== 'removed');
}

/** Under a held picture the viewer can open: why others don't see it. */
export function heldCaption(image: HeldImage, moderator: boolean): string {
  if (image.mine && !moderator) {
    return image.state === 'checking'
      ? 'Being checked. Only you can see it for now.'
      : 'Hidden from others until a student rep looks at it.';
  }
  if (image.state === 'checking') return 'Being checked. Students can’t see it yet.';
  if (image.state === 'held') return 'Held by the Hub’s check. Show or remove it in Manage, Reports.';
  return 'Removed by a student rep. Only reps can see it.';
}
