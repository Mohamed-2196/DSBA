import { cx } from './internal';
import { moduleArtSrc } from './moduleArtSrc';
import './ModuleArt.css';

export interface ModuleArtProps {
  moduleId?: string | null | undefined;
  artUrl?: string | null | undefined;
  /** sets the tile's size through --modart-size (default 48px) */
  className?: string;
}

/** A module's illustration on a light tile (it reads on both themes), or nothing when the module has none.
 *  Decorative: the module's name always sits next to it. */
export function ModuleArt({ moduleId, artUrl, className }: ModuleArtProps) {
  const src = moduleArtSrc(moduleId, artUrl);
  if (!src) return null;
  return (
    <span className={cx('ui-modart', className)} aria-hidden="true">
      <img className="ui-modart__img" src={src} alt="" width={512} height={512} decoding="async" loading="lazy" />
    </span>
  );
}
