import { Link } from 'react-router-dom';
import { useModules } from '../../../state/modules';
import { Badge } from '../../../ui';
import { itemPath } from '../api';
import { cardMeta, matchLine, moduleTag, statusInfo } from '../display';
import type { LibraryItem, LibrarySort } from '../types';
import { FileThumb, type ThumbSize } from './FileThumb';
import { StarButton } from './StarButton';

export interface LinkState {
  from: string;
}

/** Grid item: the cover is the card (no chrome), title and one line of meta below. */
export function FileCard({
  item,
  sort = 'new',
  onToggleStar,
  linkState,
  thumbSize = 'grid',
}: {
  item: LibraryItem;
  sort?: LibrarySort;
  onToggleStar: (item: LibraryItem) => void;
  linkState?: LinkState;
  thumbSize?: ThumbSize;
}) {
  const { getModule } = useModules();
  const code = moduleTag(getModule(item.moduleId));
  const status = statusInfo(item.status);
  const titleHasCode = !!code && item.title.toLowerCase().startsWith(code.toLowerCase());
  const found = matchLine(item);
  return (
    <article className="lib-card" data-hub="file-card">
      <Link to={itemPath(item)} state={linkState} className="lib-card__link">
        <FileThumb item={item} size={thumbSize} newTag formatTag />
        <span className="lib-card__title">{item.title}</span>
        {found ? <span className="lib-card__match">{found}</span> : null}
        {status ? (
          <Badge tone={status.tone} size="sm" className="lib-card__status">
            {status.label}
          </Badge>
        ) : null}
      </Link>
      <div className="lib-card__foot">
        <span className="lib-card__meta">
          {code && !titleHasCode ? <span className="lib-card__code">{code}</span> : null}
          <span className="lib-card__metatext">{cardMeta(item, sort)}</span>
        </span>
        {item.status === 'published' ? (
          <StarButton on={item.starred} onToggle={() => onToggleStar(item)} title={item.title} className="lib-card__star" />
        ) : null}
      </div>
    </article>
  );
}
