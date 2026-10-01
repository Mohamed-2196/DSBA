import { Link } from 'react-router-dom';
import { ArrowDown, ArrowSquareOut } from '@phosphor-icons/react';
import { Badge, IconButton, cx, timeAgo } from '../../../ui';
import { moduleTag, pagesLabel, sizeLabel } from '../data/display.js';
import { FileThumb } from './FileThumb.jsx';
import { StarButton } from './StarButton.jsx';

function SortHeader({ id, sort, onSort, children, className }) {
  const active = sort === id;
  return (
    <th scope="col" className={className} aria-sort={active ? (id === 'az' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className={cx('lib-table__sort', active && 'is-active')} onClick={() => onSort?.(id)}>
        {children}
        <ArrowDown aria-hidden="true" className="lib-table__sort-icon" weight="bold" />
      </button>
    </th>
  );
}

/** Dense list view: thumbnail + name, type, pages, size, added, downloads, star, Open original. */
export function FileTable({ files, sort, onSort, isStarred, onToggleStar, linkState }) {
  return (
    <div className="lib-table-wrap">
      <table className="lib-table">
        <thead>
          <tr>
            <SortHeader id="az" sort={sort} onSort={onSort} className="lib-table__name">Name</SortHeader>
            <th scope="col" className="lib-table__type">Type</th>
            <th scope="col" className="lib-table__num lib-table__pages">Pages</th>
            <th scope="col" className="lib-table__num lib-table__size">Size</th>
            <SortHeader id="newest" sort={sort} onSort={onSort} className="lib-table__added">Added</SortHeader>
            <SortHeader id="downloads" sort={sort} onSort={onSort} className="lib-table__num lib-table__downloads">Downloads</SortHeader>
            <th scope="col" className="lib-table__actions"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id} className="lib-row" data-pulse="file-card">
              <td className="lib-table__name">
                <Link to={f.url} state={linkState} className="lib-row__link">
                  <FileThumb file={f} size="list" />
                  <span className="lib-row__text">
                    <span className="lib-row__title">
                      <span className="lib-row__name">
                        {f.title}
                        <span className="lib-card__ext">.{f.ext}</span>
                      </span>
                      {f.isNew ? <Badge tone="highlight" size="sm">New</Badge> : null}
                    </span>
                    <span className="lib-row__sub">
                      <span className="lib-row__code">{moduleTag(f)}</span>
                      <span className="lib-row__mobile-meta">{f.kindLabel}, {pagesLabel(f)}, {timeAgo(f.addedAt)}</span>
                      <span className="lib-row__module">{f.moduleName}</span>
                    </span>
                  </span>
                </Link>
              </td>
              <td className="lib-table__type">{f.kindLabel}</td>
              <td className="lib-table__num lib-table__pages">{f.pages}</td>
              <td className="lib-table__num lib-table__size">{sizeLabel(f)}</td>
              <td className="lib-table__added"><time dateTime={f.addedAt}>{timeAgo(f.addedAt)}</time></td>
              <td className="lib-table__num lib-table__downloads">{f.downloads.toLocaleString('en-GB')}</td>
              <td className="lib-table__actions">
                <span className="lib-row__actions">
                  <StarButton on={isStarred(f.id)} onToggle={() => onToggleStar(f.id)} title={f.title} />
                  <IconButton label={`Open original of ${f.title} on Google Drive`} icon={ArrowSquareOut} href={f.sourceUrl} size="sm" className="lib-row__original" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
