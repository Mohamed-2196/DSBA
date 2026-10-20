// The library's index cards: one file per card, its first page (or its drawn document, coloured by type), its name, what it is and who
// shared it, and for a past paper the two things a student does with one, Time me and Open
// (docs/design/deskmates/v2/library-screen.svg). The whole card opens the file; the buttons sit above that link.
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth';
import { useModules } from '../../../state/modules';
import { Badge, Button, Icon, IconButton, cx, glyph } from '../../../ui';
import { PaperDone } from '../../board/public';
import { downloadHref, itemPath, openLinkHref, timeMeHref } from '../api';
import {
  examTitle,
  hasExamTitle,
  isNew,
  linkPlace,
  matchLine,
  moduleTag,
  rowMeta,
  sharedBy,
  statusInfo,
} from '../display';
import type { LibraryItem, LibrarySort } from '../types';
import type { LinkState } from './FileCard';
import { CoverThumb } from './CoverThumb';
import { QL_BUTTON, QL_FILE, QL_LINK } from '../quickLook/rules';
import { useQuickLook } from '../quickLook/useQuickLook';
import { StarButton } from './StarButton';
import './FileRow.css';

function FileRow({
  item,
  sort,
  onToggleStar,
  onPreview,
  linkState,
}: {
  item: LibraryItem;
  sort: LibrarySort;
  onToggleStar: (item: LibraryItem) => void;
  onPreview: (item: LibraryItem) => void;
  linkState?: LinkState;
}) {
  const { getModule } = useModules();
  const { featureOn } = useAuth();
  const m = getModule(item.moduleId);
  const code = moduleTag(m);
  const name = examTitle(item, code);
  const status = statusInfo(item.status);
  const by = sharedBy(item);
  const found = matchLine(item);
  const published = item.status === 'published';
  const paper = published && item.kind === 'past-paper' && item.source === 'file';
  return (
    <article className={cx('lib-ix', paper && 'lib-ix--paper')} data-hub="file-card" {...{ [QL_FILE]: item.id }}>
      <CoverThumb item={item} size="lg" className="lib-ix__doc" />
      <div className="lib-ix__main">
        <p className="lib-ix__title">
          <Link
            to={itemPath(item)}
            state={linkState}
            className="lib-ix__link"
            title={name === item.title ? undefined : item.title}
            {...{ [QL_LINK]: '' }}
          >
            {name}
          </Link>
          {isNew(item) ? (
            <Badge tone="highlight" size="sm">
              New
            </Badge>
          ) : null}
          {status ? (
            <Badge tone={status.tone} size="sm">
              {status.label}
            </Badge>
          ) : null}
        </p>
        <p className="lib-ix__meta">
          {code && !hasExamTitle(item) ? <span className="lib-ix__code u-code">{code}</span> : null}
          <span>{rowMeta(item, sort)}</span>
        </p>
        {by ? <p className="lib-ix__by">{by}</p> : null}
        {found ? <p className="lib-ix__match">{found}</p> : null}
      </div>
      <div className="lib-ix__side">
        <IconButton
          label={`Preview ${name}`}
          icon={<Icon glyph={glyph.eye} />}
          size="sm"
          className="lib-ix__preview"
          onClick={() => onPreview(item)}
          {...{ [QL_BUTTON]: '' }}
        />
        {published ? <StarButton on={item.starred} onToggle={() => onToggleStar(item)} title={name} /> : null}
        {item.source === 'link' ? (
          <IconButton
            label={`Open ${name} on ${linkPlace(item)} (opens in a new tab)`}
            icon={<Icon glyph={glyph.external} />}
            href={openLinkHref(item)}
            size="sm"
            className="lib-ix__original"
          />
        ) : (
          <IconButton
            label={`Download ${name}`}
            icon={<Icon glyph={glyph.download} />}
            href={downloadHref(item)}
            size="sm"
            className="lib-ix__original"
          />
        )}
      </div>
      {paper ? (
        <div className="lib-ix__actions">
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Icon glyph={glyph.timer} />}
            to={timeMeHref(item)}
            state={linkState}
            aria-label={`Time me on ${name}`}
          >
            Time me
          </Button>
          <Button size="sm" to={itemPath(item)} state={linkState} aria-label={`Open ${name}`}>
            Open
          </Button>
          {featureOn('board') ? <PaperDone itemId={item.id} /> : null}
        </div>
      ) : null}
    </article>
  );
}

/** A list of files as index cards: one column on phones, as many as fit beside each other on wider screens. Space on
 *  a file, or its Preview button, shows it in Quick Look. */
export function FileRows({
  items,
  sort,
  onToggleStar,
  linkState,
  className,
}: {
  items: readonly LibraryItem[];
  sort: LibrarySort;
  onToggleStar: (item: LibraryItem) => void;
  linkState?: LinkState;
  className?: string;
}) {
  const quickLook = useQuickLook(items);
  return (
    <>
      <ul className={cx('lib-ixs', className)} role="list" {...quickLook.listProps}>
        {items.map((f) => (
          <li key={f.id}>
            <FileRow
              item={f}
              sort={sort}
              onToggleStar={onToggleStar}
              onPreview={quickLook.preview}
              linkState={linkState}
            />
          </li>
        ))}
      </ul>
      {quickLook.dialog}
    </>
  );
}
