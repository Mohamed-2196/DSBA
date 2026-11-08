// The thread page's held pictures (lib/heldPictures.ts): the provider, and what stands in for a picture the viewer
// can't open. Anywhere without the provider (the composer's preview), pictures show as usual.
import { useMemo, type ReactNode } from 'react';
import type { HeldImage } from '../../../api/types';
import { Icon, glyph } from '../../../ui';
import { HeldContext } from '../lib/heldPictures';

export function HeldPicturesProvider({
  images,
  moderator,
  children,
}: {
  images: readonly HeldImage[];
  moderator: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ images: new Map(images.map((i) => [i.id, i])), moderator }), [images, moderator]);
  return <HeldContext.Provider value={value}>{children}</HeldContext.Provider>;
}

/** In place of a picture the viewer can't open. */
export function HeldPlaceholder({ image }: { image: HeldImage }) {
  const removed = image.state === 'removed';
  return (
    <p className="forum-figure is-broken is-held" role="note" data-hub="held-picture">
      <Icon glyph={removed ? glyph.imageBroken : glyph.clock} aria-hidden="true" />
      <span>{removed ? 'A student rep removed this picture.' : 'Picture being checked'}</span>
    </p>
  );
}
