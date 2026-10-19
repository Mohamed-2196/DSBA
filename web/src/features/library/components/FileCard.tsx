import { Link } from 'react-router-dom';
import { useModules } from '../../../state/modules';
import { Badge } from '../../../ui';
import { itemPath } from '../api';
import { cardMeta, examTitle, matchLine, moduleTag, sharedBy, statusInfo } from '../display';
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
  const name = examTitle(item, code);
  const titleHasCode = !!code && name.toLowerCase().startsWith(code.toLowerCase());
  const found = matchLine(item);
  const by = sharedBy(item);
  return (
    <article className="lib-card" data-hub="file-card">
      <Link to={itemPath(item)} state={linkState} className="lib-card__link">
        <FileThumb item={item} size={thumbSize} newTag formatTag />
        <span className="lib-card__title" title={name === item.title ? undefined : item.title}>
          {name}
        </span>
        {found ? <span className="lib-card__match">{found}</span> : null}
        {by ? <span className="lib-card__by">{by}</span> : null}
        {status ? (
          <Badge tone={status.tone} size="sm" className="lib-card__status">
            {status.label}
          </Badge>
        ) : null}
      </Link>
      <div className="lib-card__foot">
        <span className="lib-card__meta">
          {code && !titleHasCode ? <span className="lib-card__code u-code">{code}</span> : null}
          <span className="lib-card__metatext">{cardMeta(item, sort)}</span>
        </span>
        {item.status === 'published' ? (
          <StarButton on={item.starred} onToggle={() => onToggleStar(item)} title={name} className="lib-card__star" />
        ) : null}
      </div>
    </article>
  );
}
