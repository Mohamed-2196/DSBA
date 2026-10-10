import { ArrowDown, ArrowSquareOut, DownloadSimple } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useModules } from '../../../state/modules';
import { Badge, IconButton, cx, timeAgo } from '../../../ui';
import { downloadHref, itemPath, openLinkHref } from '../api';
import { addedAt, isNew, linkPlace, moduleTag, sizeLabel, statusInfo } from '../display';
import { extensionOf, kindLabel } from '../kinds';
import type { LibraryItem, LibrarySort } from '../types';
import type { LinkState } from './FileCard';
import { FileThumb } from './FileThumb';
import { StarButton } from './StarButton';

function SortHeader({
  id,
  sort,
  onSort,
  className,
  children,
}: {
  id: LibrarySort;
  sort: LibrarySort;
  onSort?: (id: LibrarySort) => void;
  className?: string;
  children: ReactNode;
}) {
  const active = sort === id;
  return (
    <th scope="col" className={className} aria-sort={active ? (id === 'title' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className={cx('lib-table__sort', active && 'is-active')} onClick={() => onSort?.(id)}>
        {children}
        <ArrowDown aria-hidden="true" className="lib-table__sort-icon" weight="bold" />
      </button>
    </th>
  );
}

/** Dense list view: cover + name, type, size, added, downloads, star, download or open. */
export function FileTable({
  items,
  sort,
  onSort,
  onToggleStar,
  linkState,
}: {
  items: LibraryItem[];
  sort: LibrarySort;
  onSort?: (id: LibrarySort) => void;
  onToggleStar: (item: LibraryItem) => void;
  linkState?: LinkState;
}) {
  const { getModule } = useModules();
  return (
    <div className="lib-table-wrap">
      <table className="lib-table">
        <thead>
          <tr>
            <SortHeader id="title" sort={sort} onSort={onSort} className="lib-table__name">
              Name
            </SortHeader>
            <th scope="col" className="lib-table__type">
              Type
            </th>
            <th scope="col" className="lib-table__size">
              Format
            </th>
            <SortHeader id="new" sort={sort} onSort={onSort} className="lib-table__added">
              Added
            </SortHeader>
            <SortHeader id="popular" sort={sort} onSort={onSort} className="lib-table__num lib-table__downloads">
              Downloads
            </SortHeader>
            <th scope="col" className="lib-table__actions">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => {
            const m = getModule(f.moduleId);
            const ext = f.source === 'file' ? extensionOf(f.fileName)?.toLowerCase() : null;
            const status = statusInfo(f.status);
            return (
              <tr key={f.id} className="lib-row" data-hub="file-card">
                <td className="lib-table__name">
                  <Link to={itemPath(f)} state={linkState} className="lib-row__link">
                    <FileThumb item={f} size="list" />
                    <span className="lib-row__text">
                      <span className="lib-row__title">
                        <span className="lib-row__name">
                          {f.title}
                          {ext ? <span className="lib-card__ext">.{ext}</span> : null}
                        </span>
                        {isNew(f) ? (
                          <Badge tone="highlight" size="sm">
                            New
                          </Badge>
                        ) : null}
                        {status ? (
                          <Badge tone={status.tone} size="sm">
                            {status.label}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="lib-row__sub">
                        {m ? <span className="lib-row__code">{moduleTag(m)}</span> : null}
                        <span className="lib-row__mobile-meta">
                          {kindLabel(f.kind)}, {timeAgo(addedAt(f))}
                        </span>
                        {m ? <span className="lib-row__module">{m.name}</span> : null}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="lib-table__type">{kindLabel(f.kind)}</td>
                <td className="lib-table__size">{sizeLabel(f)}</td>
                <td className="lib-table__added">
                  <time dateTime={addedAt(f)}>{timeAgo(addedAt(f))}</time>
                </td>
                <td className="lib-table__num lib-table__downloads">{f.downloadCount.toLocaleString('en-GB')}</td>
                <td className="lib-table__actions">
                  <span className="lib-row__actions">
                    {f.status === 'published' ? <StarButton on={f.starred} onToggle={() => onToggleStar(f)} title={f.title} /> : null}
                    {f.source === 'link' ? (
                      <IconButton
                        label={`Open ${f.title} on ${linkPlace(f)} (opens in a new tab)`}
                        icon={ArrowSquareOut}
                        href={openLinkHref(f)}
                        size="sm"
                        className="lib-row__original"
                      />
                    ) : (
                      <IconButton label={`Download ${f.title}`} icon={DownloadSimple} href={downloadHref(f)} size="sm" className="lib-row__original" />
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
