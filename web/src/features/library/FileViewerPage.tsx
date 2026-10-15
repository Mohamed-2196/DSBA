// /library/:fileId (an id or a slug): the file with a real preview (PDFs and images), its details, Download or
// Open, Star, Copy link and Report. Its uploader sees its review status; moderators can review it here.
import {
  ArrowSquareOut,
  CaretLeft,
  DotsThree,
  DownloadSimple,
  FileMagnifyingGlass,
  Info,
  LinkSimple,
  Notebook,
  PencilSimple,
  Trash,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isApiError } from '../../api/errors';
import { appUrl } from '../../lib/share';
import { useCopyLink } from '../../lib/useCopyLink';
import { BREAKPOINTS, useDocumentTitle, useMediaQuery, useToast } from '../../state';
import { useModules } from '../../state/modules';
import { Badge, Button, EmptyState, IconButton, Menu, Page, Panel, QueryError, Skeleton, cx, timeAgo } from '../../ui';
import { useAuth } from '../../auth';
import { AddToBoard, PaperDone } from '../board/public';
import { ReportButton } from '../forum/public';
import { useAnnotate } from '../notes/public';
import { useLibraryAccess } from './access';
import { downloadHref, itemPath, libraryKeys, openLinkHref, useLibraryItem } from './api';
import { DeleteItemDialog, EditItemDialog } from './components/EditItemDialog';
import type { LinkState } from './components/FileCard';
import { ReviewActions } from './components/ReviewActions';
import { StarButton } from './components/StarButton';
import { isNew, linkPlace, moduleTag, pageParam, sizeLabel, statusInfo } from './display';
import { KIND_BY_ID, formatOf } from './kinds';
import type { LibraryItem } from './types';
import { useStar } from './useStar';
import { paperContext, usePaperSittings } from './papers';
import { AskNoora } from './viewer/AskNoora';
import { ExamTimer, TimeMeButton, TimeMeDialog, useExamClock } from './viewer/ExamTimer';
import { MetaPanel } from './viewer/MetaPanel';
import { Preview } from './viewer/Preview';
import './FileViewerPage.css';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function ViewerSkeleton() {
  return (
    <div className="lib-viewer is-stacked" aria-busy="true">
      <header className="lib-viewer__head">
        <Skeleton width={220} height={16} />
        <Skeleton width="min(520px, 80%)" height={30} />
      </header>
      <div className="lib-viewer__toolbar" />
      <div className="lib-viewer__body">
        <div className="lib-viewer__canvas lib-viewer__canvas--loading">
          <Skeleton className="lib-viewer__sheet-skeleton" radius={4} />
        </div>
      </div>
    </div>
  );
}

export default function FileViewerPage() {
  const { fileId } = useParams();
  const [params] = useSearchParams();
  const item = useLibraryItem(fileId);
  const notFound = item.isError && isApiError(item.error) && (item.error.status === 404 || item.error.status === 422);
  useDocumentTitle(item.data ? item.data.title : notFound ? 'File not found' : null);

  if (item.isPending) return <ViewerSkeleton />;
  if (item.isError) {
    return (
      <Page>
        {notFound ? (
          <Panel padding="none">
            <EmptyState
              icon={FileMagnifyingGlass}
              title="We couldn’t find that file"
              body="It may have been removed, or it isn’t published yet. Search the library for it instead."
              action={
                <Button variant="primary" to="/library">
                  Open the library
                </Button>
              }
            />
          </Panel>
        ) : (
          <QueryError error={item.error} title="This file didn’t load" onRetry={() => void item.refetch()} retrying={item.isFetching} />
        )}
      </Page>
    );
  }
  return <FileView key={item.data.id} item={item.data} page={pageParam(params.get('page'))} />;
}

/** What the uploader (or a moderator) sees above an item that isn't public. */
function StatusBanner({ item, onEdit, onDelete }: { item: LibraryItem; onEdit: () => void; onDelete: () => void }) {
  const { suspended, moderator: managesLibrary } = useLibraryAccess();
  const status = statusInfo(item.status);
  if (!status) return null;
  const who = item.uploadedBy?.displayName;
  // A suspended uploader can't change anything (the API answers 403): don't offer it.
  const manage = item.isMine && !suspended && item.status !== 'removed';
  return (
    <div className={cx('lib-status', `lib-status--${item.status}`)} role="status" data-hub="file-status">
      <div className="lib-status__text">
        <Badge tone={status.tone} size="sm">
          {status.label}
        </Badge>
        {item.status === 'pending' ? (
          <p>
            {item.isMine
              ? `A student rep checks every upload before it’s public. Until then only you and the reps can see this page.${manage ? ' You can still edit the details or delete it.' : ''}`
              : `${who ?? 'A student'} uploaded this ${timeAgo(item.createdAt)}. Check it, then publish it or tell them why not.`}
          </p>
        ) : item.status === 'rejected' ? (
          <p>
            {item.reviewNote ? (
              <>
                <strong>Note from the student rep:</strong> {item.reviewNote}
              </>
            ) : (
              'This file wasn’t published.'
            )}{' '}
            {/* Rejected files leave storage a week after the review (security review SEC-14). */}
            {item.isMine ? 'This copy is deleted a week after the review: to share a fixed version, upload it as a new file.' : 'Its file is deleted a week after the review.'}
          </p>
        ) : (
          <p>This file was removed from the library.</p>
        )}
      </div>
      {item.status === 'pending' && managesLibrary ? (
        <ReviewActions item={item} className="lib-status__review" />
      ) : manage ? (
        <div className="lib-status__actions">
          {item.canEdit ? (
            <Button size="sm" leadingIcon={PencilSimple} onClick={onEdit}>
              Edit details
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" leadingIcon={Trash} onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FileView({ item, page }: { item: LibraryItem; page: number | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { push } = useToast();
  const copy = useCopyLink();
  const { suspended, moderator: managesLibrary } = useLibraryAccess();
  const { featureOn } = useAuth();
  const { getModule } = useModules();
  const toggleStar = useStar();
  const isDesktop = useMediaQuery(BREAKPOINTS.desktop);
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const wide = useMediaQuery('(min-width: 1280px)');
  const [metaPref, setMetaPref] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const [params, setParams] = useSearchParams();
  const [timeMeOpen, setTimeMeOpen] = useState(false);
  const isPaper = item.kind === 'past-paper' && item.source === 'file' && item.status === 'published';
  const { clock, start, pause, resume, stop } = useExamClock(item.id);
  const sittings = usePaperSittings(item.moduleId, { enabled: isPaper && item.examYear !== null });
  const report = paperContext(sittings.data?.sittings, item.id)?.reports[0] ?? null;

  useEffect(() => {
    if (params.get('time') === '1') {
      setTimeMeOpen(true);
      setParams(
        (p) => {
          p.delete('time');
          return p;
        },
        { replace: true, state: location.state },
      );
    }
  }, [params, setParams, location.state]);

  const openPage = (n: number) =>
    setParams(
      (p) => {
        p.set('page', String(n));
        return p;
      },
      { replace: true, state: location.state },
    );
  const annotate = useAnnotate();

  const onAnnotate = () => {
    annotate.mutate(item.id, {
      onSuccess: (note) => navigate(`/notes/${note.id}`),
      onError: (err) => push({ title: isApiError(err) ? err.message : 'Couldn’t open notebook.', tone: 'alert' }),
    });
  };

  const state = location.state as Partial<LinkState> | null;
  const backTo = typeof state?.from === 'string' ? state.from : '/library';
  const linkState = useMemo<LinkState>(() => ({ from: backTo }), [backTo]);
  const m = getModule(item.moduleId);
  const kind = KIND_BY_ID[item.kind];
  const fmt = formatOf(item);
  const isLink = item.source === 'link';
  const metaOpen = isDesktop ? (metaPref ?? wide) : true;
  // The uploader of an item that isn't public manages it from the status banner; a suspended one can't.
  const canManage = managesLibrary || (item.isMine && item.status === 'published' && !suspended);
  const status = statusInfo(item.status);

  // Esc goes back to where the student came from.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[aria-modal="true"], [role="menu"]')) return;
      e.preventDefault();
      navigate(backTo);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, backTo]);

  // The download is counted by the API: re-read the item a moment later (cached by id or by slug).
  const counted = () =>
    window.setTimeout(
      () => void qc.invalidateQueries({ queryKey: libraryKeys.items, predicate: (q) => (q.state.data as LibraryItem | undefined)?.id === item.id }),
      1500,
    );

  const copyLink = () => copy(appUrl(itemPath(item)), 'Anyone can open this file with it.');

  const moreItems = [
    ...(item.canEdit ? [{ id: 'edit', label: 'Edit details', icon: PencilSimple, onSelect: () => setDialog('edit') }] : []),
    ...((item.isMine || managesLibrary) && item.status !== 'removed'
      ? [{ id: 'delete', label: 'Delete', icon: Trash, danger: true, onSelect: () => setDialog('delete') }]
      : []),
  ];

  const removed = item.status === 'removed';
  const primary = removed ? null : isLink ? (
    <Button
      variant="primary"
      size={isMobile ? 'sm' : 'md'}
      href={openLinkHref(item)}
      trailingIcon={ArrowSquareOut}
      className="lib-tb__original"
      onClick={counted}
      aria-label={`Open in ${linkPlace(item)} (opens in a new tab)`}
    >
      {isMobile ? 'Open' : `Open in ${linkPlace(item)}`}
    </Button>
  ) : isMobile ? (
    <IconButton label={`Download ${item.title}`} icon={DownloadSimple} href={downloadHref(item)} onClick={counted} variant="primary" />
  ) : (
    <Button variant="primary" leadingIcon={DownloadSimple} href={downloadHref(item)} onClick={counted} className="lib-tb__download">
      Download
    </Button>
  );

  return (
    <div className={cx('lib-viewer', isDesktop ? 'is-app' : 'is-stacked')} data-hub="file-viewer">
      <header className="lib-viewer__head">
        <nav aria-label="Breadcrumb" className="lib-crumbs">
          <ol>
            <li>
              <Link to={backTo} className="lib-crumbs__back">
                <CaretLeft aria-hidden="true" weight="bold" />
                Library
              </Link>
            </li>
            {m ? (
              <li>
                <Link to={`/library?module=${m.id}`}>
                  {m.unitCode ? <strong className="u-tabular">{m.unitCode}</strong> : null} {m.unitCode ? m.shortName : m.name}
                </Link>
              </li>
            ) : null}
            <li>
              <Link to={m ? `/library?module=${m.id}&type=${item.kind}` : `/library?type=${item.kind}&year=all`}>{kind.plural}</Link>
            </li>
          </ol>
        </nav>
        <div className="lib-viewer__titlerow">
          <h1 className="lib-viewer__title">{item.title}</h1>
          <span className="lib-viewer__badges">
            {fmt ? <Badge tone="outline">{fmt.tag}</Badge> : <Badge tone="outline">Link</Badge>}
            {isNew(item) ? <Badge tone="highlight">New</Badge> : null}
            {featureOn('board') && item.kind === 'past-paper' ? <PaperDone itemId={item.id} /> : null}
          </span>
          {featureOn('board') && item.status === 'published' ? <AddToBoard link={{ type: 'library_item', id: item.id }} className="lib-viewer__board" /> : null}
        </div>
      </header>

      <div className="lib-viewer__toolbar" role="toolbar" aria-label="File" data-hub="file-toolbar">
        <div className="lib-tb__group lib-tb__info">
          <span className="lib-tb__facts">
            {moduleTag(m) ? <strong>{moduleTag(m)}</strong> : null}
            <span>{sizeLabel(item)}</span>
          </span>
        </div>
        <div className="lib-tb__group lib-tb__actions">
          {item.status === 'published' ? <StarButton on={item.starred} onToggle={() => toggleStar(item)} title={item.title} size="md" tooltip={isDesktop} /> : null}
          {item.status === 'published' ? <IconButton label="Copy link" icon={LinkSimple} onClick={() => void copyLink()} tooltip={isDesktop} className="lib-tb__copy" /> : null}
          {item.status === 'published' && !item.isMine ? <ReportButton targetType="library_item" targetId={item.id} className="lib-tb__report" /> : null}
          {isPaper ? <TimeMeButton compact={isMobile} onClick={() => setTimeMeOpen(true)} /> : null}
          {canManage && moreItems.length ? (
            <Menu align="end" label="More actions" items={moreItems} trigger={<IconButton label="More actions" icon={DotsThree} tooltip={isDesktop} />} />
          ) : null}
          {featureOn('notes') && fmt?.tag === 'PDF' && item.status === 'published' ? (
            <Button
              variant="secondary"
              leadingIcon={Notebook}
              onClick={onAnnotate}
              loading={annotate.isPending}
              size={isMobile ? 'sm' : 'md'}
              data-hub="annotate-in-notebook"
            >
              Annotate in my notebook
            </Button>
          ) : null}
          <AskNoora item={item} page={page} compact={isMobile} />
          {primary}
          {isDesktop ? (
            <>
              <span className="lib-tb__sep" aria-hidden="true" />
              <IconButton
                label={metaOpen ? 'Hide details' : 'Show details'}
                icon={Info}
                toggle
                active={metaOpen}
                onClick={() => setMetaPref(!metaOpen)}
                tooltip
                tooltipSide="bottom"
              />
            </>
          ) : null}
        </div>
      </div>

      {clock ? <ExamTimer item={item} clock={clock} report={report} onPause={pause} onResume={resume} onStop={stop} /> : null}
      {status ? <StatusBanner item={item} onEdit={() => setDialog('edit')} onDelete={() => setDialog('delete')} /> : null}

      <div className={cx('lib-viewer__body', isDesktop && metaOpen && 'has-meta')}>
        <div className="lib-viewer__canvas" role="region" aria-label={`${item.title}, preview`}>
          <Preview item={item} compact={isMobile} page={page} />
        </div>
        {metaOpen ? (
          <MetaPanel id="lib-file-meta" item={item} linkState={linkState} className={isDesktop ? undefined : 'lib-meta--stacked'} onPage={openPage} />
        ) : null}
      </div>

      {timeMeOpen ? <TimeMeDialog open onClose={() => setTimeMeOpen(false)} onStart={start} /> : null}

      {dialog === 'edit' ? <EditItemDialog item={item} open onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? (
        <DeleteItemDialog
          item={item}
          open
          onClose={() => setDialog(null)}
          onDeleted={() => {
            push({ title: 'Deleted', body: `“${item.title}” is no longer in the library.`, tone: 'success' });
            navigate(item.isMine ? '/library?mine=1' : backTo, { replace: true });
          }}
        />
      ) : null}
    </div>
  );
}
