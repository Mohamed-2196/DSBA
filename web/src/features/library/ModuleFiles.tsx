// The module page's Files tab: the module's library items grouped by type, with Upload and a way into the
// library already filtered to the module.
import { ArrowSquareOut, Books, DownloadSimple, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useModules } from '../../state/modules';
import { Badge, Button, EmptyState, IconButton, Panel, Skeleton, timeAgo } from '../../ui';
import { downloadHref, itemPath, openLinkHref, useLibraryList } from './api';
import type { LinkState } from './components/FileCard';
import { FileThumb } from './components/FileThumb';
import { StarButton } from './components/StarButton';
import { UploadDialog } from './components/UploadDialog';
import { addedAt, examLabel, isNew, linkPlace, moduleTag, sizeLabel } from './display';
import { KINDS, type LibraryKind } from './kinds';
import type { LibraryItem } from './types';
import { useStar } from './useStar';
import './ModuleFiles.css';

const LIMIT = 100;

function FileRow({ item, linkState, onToggleStar }: { item: LibraryItem; linkState: LinkState; onToggleStar: (item: LibraryItem) => void }) {
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
          <IconButton label={`Open ${item.title} on ${linkPlace(item)} (opens in a new tab)`} icon={ArrowSquareOut} href={openLinkHref(item)} size="sm" />
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
  const { requireAuth } = useAuth();
  const toggleStar = useStar();
  const m = getModule(moduleId);
  const files = useLibraryList({ moduleId, sort: 'title' }, { limit: LIMIT });
  const [upload, setUpload] = useState({ open: false, key: 0 });
  const linkState = useMemo<LinkState>(() => ({ from: `${location.pathname}${location.search}` }), [location.pathname, location.search]);
  const name = moduleTag(m) ?? 'this module';
  const libraryHref = `/library?module=${encodeURIComponent(moduleId)}`;

  const groups = useMemo(() => {
    const byKind = new Map<LibraryKind, LibraryItem[]>();
    for (const f of files.data?.items ?? []) {
      if (f.status !== 'published') continue;
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    }
    return KINDS.filter((k) => byKind.has(k.id)).map((k) => ({ kind: k, items: byKind.get(k.id) ?? [] }));
  }, [files.data]);

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
      <Panel padding="none">
        <EmptyState
          icon={WarningCircle}
          title="The files didn’t load"
          body="Check your connection, then try again."
          action={<Button onClick={() => void files.refetch()}>Try again</Button>}
        />
      </Panel>
    );
  } else if (!groups.length) {
    body = (
      <Panel padding="none">
        <EmptyState
          icon={Books}
          title={`No files for ${name} yet`}
          body="Past papers, notes and guides that students share for this module will show up here."
          action={
            <Button variant="primary" leadingIcon={UploadSimple} onClick={startUpload}>
              Upload the first one
            </Button>
          }
        />
      </Panel>
    );
  } else {
    body = (
      <div className="lib-mf__groups">
        {groups.map(({ kind, items }) => (
          <section key={kind.id} className="lib-mf__group" aria-labelledby={`lib-mf-${kind.id}`}>
            <h3 id={`lib-mf-${kind.id}`} className="lib-mf__h">
              {kind.plural}
              <span className="lib-mf__count">{items.length}</span>
            </h3>
            <Panel as="div" padding="none" className="lib-mf__panel">
              <ul role="list" className="lib-mf__list">
                {items.map((f) => (
                  <FileRow key={f.id} item={f} linkState={linkState} onToggleStar={toggleStar} />
                ))}
              </ul>
            </Panel>
          </section>
        ))}
        {total > LIMIT ? (
          <p className="lib-mf__more">
            <Link to={libraryHref}>See all {total} files in the library</Link>
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
              <strong className="u-tabular">{total}</strong> {total === 1 ? 'file' : 'files'} for {name}, shared by students and the course
            </>
          ) : (
            <Skeleton width={220} height={18} />
          )}
        </p>
        <div className="lib-mf__tools">
          <Button size="sm" variant="ghost" to={libraryHref}>
            Open in the library
          </Button>
          <Button size="sm" leadingIcon={UploadSimple} onClick={startUpload}>
            Upload a file
          </Button>
        </div>
      </div>
      {body}
      <UploadDialog key={upload.key} open={upload.open} onClose={() => setUpload((u) => ({ ...u, open: false }))} defaultModuleId={moduleId} defaultYear={m?.year ?? null} />
    </div>
  );
}
