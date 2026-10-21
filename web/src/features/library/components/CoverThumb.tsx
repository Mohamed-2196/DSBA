import { useState } from 'react';
import { DocThumb, cx } from '../../../ui';
import { docTone } from '../kinds';
import { useLibraryItem } from '../api';
import type { LibraryItem } from '../types';
import { useCoverStyle } from './coverStyle';
import './CoverThumb.css';

/**
 * A file's real first page beside its name in a list (`coverUrl`: the cover the API's text worker made), in a slot
 * of a fixed size so every row's text starts at the same place. The drawn document of its kind stands in while the
 * file has no cover (links, files not read yet), when the picture doesn't load, or when the student chose styled
 * covers. Sizes: sm 20 × 25 px (table cells), md 32 × 40 px (Home's lists), lg 48 × 62 px (the library's index cards). Decoration: the file's name
 * is always beside it.
 */
export function CoverThumb({
  item,
  size,
  className,
}: {
  item: Pick<LibraryItem, 'kind' | 'source' | 'coverUrl'>;
  size: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [style] = useCoverStyle();
  const [broken, setBroken] = useState<string | null>(null);
  const src = style === 'original' && item.coverUrl && broken !== item.coverUrl ? item.coverUrl : null;
  return (
    <span
      className={cx('lib-cthumb', `lib-cthumb--${size}`, className)}
      aria-hidden="true"
      data-cover={src ? 'page' : 'drawn'}
    >
      {src ? (
        <img
          className="lib-cthumb__page"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setBroken(src)}
        />
      ) : (
        <DocThumb tone={docTone(item)} size={size} />
      )}
    </span>
  );
}

/** A recently opened file has only an id; read its current cover through the shared item cache. */
export function ItemCoverThumb({ id, kind = 'other' }: { id: string; kind?: LibraryItem['kind'] }) {
  const item = useLibraryItem(id);
  return <CoverThumb item={item.data ?? { kind, source: 'file', coverUrl: null }} size="md" />;
}
