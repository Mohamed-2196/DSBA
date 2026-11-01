// The module page's Files tab: the module's files grouped by type (past papers by sitting first), a page at a time,
// with Upload a file, and Add a link for the people who manage the library. There is no library page besides: this
// is where a module's files are.
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { showsUpload, useAuth } from '../../auth';
import { useModules } from '../../state/modules';
import { Button, DocThumb, EmptyState, Icon, Panel, QueryError, Skeleton, formatCount, glyph } from '../../ui';
import { useLibraryAccess } from './access';
import { useLibraryPages } from './api';
import { AddLinkDialog } from './components/AddLinkDialog';
import { AskLink } from '../requests/public';
import type { LinkState } from './types';
import { FileRows } from './components/FileRow';
import { PaperSittings } from './components/PaperSittings';
import { UploadDialog } from './components/UploadDialog';
import { moduleTag } from './display';
import { EXAM_KINDS, KINDS, docTone, type LibraryKind } from './kinds';
import type { LibraryItem } from './types';
import { useStar } from './useStar';
import './ModuleFiles.css';

const PAGE = 100;

/** Files for one module (published), grouped by type in the library's order. */
export default function ModuleFiles({ moduleId }: { moduleId: string }) {
  const location = useLocation();
  const { getModule } = useModules();
  const { requireAuth, featureOn, mayTry } = useAuth();
  const uploadShown = showsUpload(featureOn, mayTry);
  const board = featureOn('board');
  const toggleStar = useStar();
  const m = getModule(moduleId);
  const { moderator } = useLibraryAccess();
  const files = useLibraryPages({ moduleId, sort: 'title' }, { pageSize: PAGE });
  const items = useMemo(() => files.data?.pages.flatMap((p) => p.items) ?? [], [files.data]);
  const [upload, setUpload] = useState({ open: false, key: 0 });
  const [linking, setLinking] = useState({ open: false, key: 0 });
  const linkState = useMemo<LinkState>(
    () => ({ from: `${location.pathname}${location.search}` }),
    [location.pathname, location.search],
  );
  const name = moduleTag(m) ?? 'this module';

  const groups = useMemo(() => {
    const byKind = new Map<LibraryKind, LibraryItem[]>();
    for (const f of items) {
      if (f.status !== 'published' || (f.source === 'file' && EXAM_KINDS.has(f.kind))) continue; // papers: by sitting, above
      byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    }
    return KINDS.filter((k) => byKind.has(k.id)).map((k) => ({ kind: k, items: byKind.get(k.id) ?? [] }));
  }, [items]);
  const hasPapers = items.some((f) => f.status === 'published' && f.source === 'file' && EXAM_KINDS.has(f.kind));
  const fileList = (items: LibraryItem[]) => (
    <FileRows items={items} sort="title" onToggleStar={toggleStar} linkState={linkState} />
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
  const total = files.data?.pages[0]?.total ?? 0;

  let body;
  if (files.isPending) {
    body = (
      <div className="lib-mf__skeletons" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="lib-mf__skeleton">
            <Skeleton width={40} height={50} radius={6} />
            <Skeleton lines={2} />
          </div>
        ))}
      </div>
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
          mate="stacks"
          title={`No files for ${name} yet`}
          body="Past papers, notes and guides that students share for this module will show up here."
          action={
            uploadShown ? (
              <Button variant="primary" leadingIcon={<Icon glyph={glyph.upload} />} onClick={startUpload}>
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
              <DocThumb tone={docTone({ kind: kind.id, source: 'file' })} size="sm" />
              {kind.plural}
              <span className="lib-mf__count">{items.length}</span>
            </h3>
            {fileList(items)}
          </section>
        ))}
        {files.hasNextPage ? (
          <p className="lib-mf__more">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void files.fetchNextPage()}
              loading={files.isFetchingNextPage}
            >
              Show the other {formatCount(total - items.length)} files
            </Button>
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
          {moderator ? (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Icon glyph={glyph.link} />}
              onClick={() => setLinking((l) => ({ open: true, key: l.key + 1 }))}
              data-hub="link-button"
            >
              Add a link
            </Button>
          ) : null}
          {uploadShown ? (
            <Button
              size="sm"
              leadingIcon={<Icon glyph={glyph.upload} />}
              onClick={startUpload}
              data-hub="upload-button"
            >
              Upload a file
            </Button>
          ) : null}
        </div>
      </div>
      {body}
      {files.data ? <AskLink lead={`Can’t find a file for ${name}?`} /> : null}
      {uploadShown ? (
        <UploadDialog
          key={upload.key}
          open={upload.open}
          onClose={() => setUpload((u) => ({ ...u, open: false }))}
          defaultModuleId={moduleId}
          defaultYear={m?.year ?? null}
        />
      ) : null}
      {moderator && linking.key > 0 ? (
        <AddLinkDialog
          key={linking.key}
          open={linking.open}
          onClose={() => setLinking((l) => ({ ...l, open: false }))}
          moduleId={moduleId}
          year={m?.year ?? null}
        />
      ) : null}
    </div>
  );
}
