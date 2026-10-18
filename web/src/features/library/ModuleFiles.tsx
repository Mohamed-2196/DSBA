// The module page's Files tab: the module's library items grouped by type, with Upload and a way into the
// library already filtered to the module.
import { ArrowSquareOut, Books, DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { showsUpload, useAuth } from '../../auth';
import { PaperDone } from '../board/public';
import { useModules } from '../../state/modules';
import { Badge, Button, EmptyState, IconButton, Panel, QueryError, Skeleton, formatCount, timeAgo } from '../../ui';
import { downloadHref, itemPath, openLinkHref, useLibraryList } from './api';
import type { LinkState } from './components/FileCard';
import { FileThumb } from './components/FileThumb';
import { PaperSittings } from './components/PaperSittings';
import { StarButton } from './components/StarButton';
import { UploadDialog } from './components/UploadDialog';
import { addedAt, isNew, linkPlace, moduleTag, sizeLabel } from './display';
import { examLabel } from '../../lib/exams';
import { EXAM_KINDS, KINDS, type LibraryKind } from './kinds';
import type { LibraryItem } from './types';
import { useStar } from './useStar';
import './ModuleFiles.css';

const LIMIT = 100;

function FileRow({
  item,
  linkState,
  onToggleStar,
  board,
}: {
  item: LibraryItem;
  linkState: LinkState;
  onToggleStar: (item: LibraryItem) => void;
  board: boolean;
}) {
  const exam = examLabel(item);
  return (
    <li className="lib-mf__row">
      <Link to={itemPath(item)} state={linkState} className="lib-mf__link">
        <FileThumb item={item} size="list" />
        <span className="lib-mf__text">
          <span className="lib-mf__title">
            <span className="lib-mf__name">{item.title}</span>
            {isNew(item) ? (
              <Badge tone="highlight" size="sm">
                New
              </Badge>
            ) : null}
            {board && item.kind === 'past-paper' ? <PaperDone itemId={item.id} /> : null}
          </span>
          <span className="lib-mf__meta">
            {exam ? <span>{exam}</span> : null}
            <span>{sizeLabel(item)}</span>
            {item.authorName ? <span>{item.authorName}</span> : null}
            <span>Added {timeAgo(addedAt(item))}</span>
          </span>
        </span>
      </Link>
      <span className="lib-mf__actions">
        <StarButton on={item.starred} onToggle={() => onToggleStar(item)} title={item.title} />
        {item.source === 'link' ? (
          <IconButton
            label={`Open ${item.title} on ${linkPlace(item)} (opens in a new tab)`}
            icon={ArrowSquareOut}
            href={openLinkHref(item)}
            size="sm"
          />
        ) : (
          <IconButton label={`Download ${item.title}`} icon={DownloadSimple} href={downloadHref(item)} size="sm" />
        )}
      </span>
    </li>
  );
}

/** Files for one module (published), grouped by type in the library's order. */
export default function ModuleFiles({ moduleId }: { moduleId: string }) {
  const location = useLocation();
  const { getModule } = useModules();
  const { requireAuth, featureOn, mayTry } = useAuth();
  const uploadShown = showsUpload(featureOn, mayTry);
  const board = featureOn('board');
  const toggleStar = useStar();
  const m = getModule(moduleId);
  const files = useLibraryList({ moduleId, sort: 'title' }, { limit: LIMIT });
  const [upload, setUpload] = useState({ open: false, key: 0 });
  const linkState = useMemo<LinkState>(
    () => ({ from: `${location.pathname}${location.search}` }),
    [location.pathname, location.search],
  );
  const name = moduleTag(m) ?? 'this module';
  const libraryHref = `/library?module=${encodeURIComponent(moduleId)}`;

  const groups = useMemo(() => {
    const byKind = new Map<LibraryKind, LibraryItem[]>();
    for (const f of files.data?.items ?? []) {
      if (f.status !== 'published' || (f.source === 'file' && EXAM_KINDS.has(f.kind))) continue; // papers: by sitting, above
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    }
    return KINDS.filter((k) => byKind.has(k.id)).map((k) => ({ kind: k, items: byKind.get(k.id) ?? [] }));
  }, [files.data]);
  const hasPapers = (files.data?.items ?? []).some(
    (f) => f.status === 'published' && f.source === 'file' && EXAM_KINDS.has(f.kind),
  );
  const fileList = (items: LibraryItem[]) => (
    <Panel as="div" padding="none" className="lib-mf__panel">
      <ul role="list" className="lib-mf__list">
        {items.map((f) => (
          <FileRow key={f.id} item={f} linkState={linkState} onToggleStar={toggleStar} board={board} />
        ))}
      </ul>
    </Panel>
  );

  // '#papers' or '#files-<kind>' (from the Overview tab's shelves): scroll there once that part is on screen (the
  // sittings load on their own, so look a few times).
  const hash = location.hash.slice(1);
  const ready = !!files.data;
  useEffect(() => {
    if (!ready || !/^(papers|files-[a-z-]+)$/.test(hash)) return undefined;
    let tries = 0;
    const t = window.setInterval(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ block: 'start' });
      if (el || ++tries > 20) window.clearInterval(t);
    }, 150);
    return () => window.clearInterval(t);
  }, [ready, hash]);

  const openUpload = () => setUpload((u) => ({ open: true, key: u.key + 1 }));
  const startUpload = () => {
    if (requireAuth('Sign in to upload a file', openUpload)) openUpload();
  };
  const total = files.data?.total ?? 0;

  let body;
  if (files.isPending) {
    body = (
      <Panel padding="none" className="lib-mf__panel" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="lib-mf__skeleton">
            <Skeleton width={46} height={65} radius={2} />
            <Skeleton lines={2} />
          </div>
        ))}
      </Panel>
    );
  } else if (files.isError) {
    body = (
      <QueryError
        error={files.error}
        title={`The files for ${name} didn’t load`}
        onRetry={() => void files.refetch()}
        retrying={files.isFetching}
      />
    );
  } else if (!groups.length && !hasPapers) {
    body = (
      <Panel padding="none">
        <EmptyState
          icon={Books}
          title={`No files for ${name} yet`}
          body="Past papers, notes and guides that students share for this module will show up here."
          action={
            uploadShown ? (
              <Button variant="primary" leadingIcon={UploadSimple} onClick={startUpload}>
                Upload the first one
              </Button>
            ) : undefined
          }
        />
      </Panel>
    );
  } else {
    body = (
      <div className="lib-mf__groups">
        <PaperSittings moduleId={moduleId} linkState={linkState} renderOther={fileList} board={board} />
        {groups.map(({ kind, items }) => (
          <section
            key={kind.id}
            id={`files-${kind.id}`}
            className="lib-mf__group"
            aria-labelledby={`lib-mf-${kind.id}`}
          >
            <h3 id={`lib-mf-${kind.id}`} className="lib-mf__h">
              {kind.plural}
              <span className="lib-mf__count">{items.length}</span>
            </h3>
            {fileList(items)}
          </section>
        ))}
        {total > LIMIT ? (
          <p className="lib-mf__more">
            <Link to={libraryHref}>See all {formatCount(total)} files in the library</Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="lib-mf" data-hub="module-files">
      <div className="lib-mf__head">
        <p className="lib-mf__sum">
          {files.data ? (
            <>
              <strong className="u-tabular">{formatCount(total)}</strong> {total === 1 ? 'file' : 'files'} for {name},
              shared by students and the course
            </>
          ) : (
            <Skeleton width={220} height={18} />
          )}
        </p>
        <div className="lib-mf__tools">
          <Button size="sm" variant="ghost" to={libraryHref}>
            Open in the library
          </Button>
          {uploadShown ? (
            <Button size="sm" leadingIcon={UploadSimple} onClick={startUpload}>
              Upload a file
            </Button>
          ) : null}
        </div>
      </div>
      {body}
      {uploadShown ? (
        <UploadDialog
          key={upload.key}
          open={upload.open}
          onClose={() => setUpload((u) => ({ ...u, open: false }))}
          defaultModuleId={moduleId}
          defaultYear={m?.year ?? null}
        />
      ) : null}
    </div>
  );
}
