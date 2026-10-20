import { Link } from 'react-router-dom';
import { useModules } from '../../../state/modules';
import { Badge, Icon, IconButton, glyph } from '../../../ui';
import { itemPath } from '../api';
import { cardMeta, examTitle, matchLine, moduleTag, sharedBy, statusInfo } from '../display';
import type { LibraryItem, LibrarySort } from '../types';
import { FileThumb, type ThumbSize } from './FileThumb';
import { QL_BUTTON, QL_FILE, QL_LINK } from '../quickLook/rules';
import { useQuickLook } from '../quickLook/useQuickLook';
import { StarButton } from './StarButton';

export interface LinkState {
  from: string;
}

/** Grid item: the cover is the card (no chrome), title and one line of meta below. */
export function FileCard({
  item,
  sort = 'new',
  onToggleStar,
  onPreview,
  linkState,
  thumbSize = 'grid',
}: {
  item: LibraryItem;
  sort?: LibrarySort;
  onToggleStar: (item: LibraryItem) => void;
  onPreview: (item: LibraryItem) => void;
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
    <article className="lib-card" data-hub="file-card" {...{ [QL_FILE]: item.id }}>
      <Link to={itemPath(item)} state={linkState} className="lib-card__link" {...{ [QL_LINK]: '' }}>
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
        <IconButton
          label={`Preview ${name}`}
          icon={<Icon glyph={glyph.eye} />}
          size="sm"
          className="lib-card__preview"
          onClick={() => onPreview(item)}
          {...{ [QL_BUTTON]: '' }}
        />
        {item.status === 'published' ? (
          <StarButton on={item.starred} onToggle={() => onToggleStar(item)} title={name} className="lib-card__star" />
        ) : null}
      </div>
    </article>
  );
}

/** Files as covers in a grid. Space on a file, or its Preview button, shows it in Quick Look. */
export function FileGrid({
  items,
  ...card
}: {
  items: readonly LibraryItem[];
  sort: LibrarySort;
  onToggleStar: (item: LibraryItem) => void;
  linkState?: LinkState;
  thumbSize: ThumbSize;
}) {
  const quickLook = useQuickLook(items);
  return (
    <>
      <div className="lib-grid" {...quickLook.listProps}>
        {items.map((f) => (
          <FileCard key={f.id} item={f} onPreview={quickLook.preview} {...card} />
        ))}
      </div>
      {quickLook.dialog}
    </>
  );
}
