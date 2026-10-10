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
  PencilSimple,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { BREAKPOINTS, useDocumentTitle, useMediaQuery, useToast } from '../../state';
import { useModules } from '../../state/modules';
import { Badge, Button, EmptyState, IconButton, Menu, Page, Panel, Skeleton, cx, timeAgo } from '../../ui';
import { ReportButton } from '../forum/ReportButton';
import { downloadHref, itemPath, libraryKeys, openLinkHref, useLibraryItem } from './api';
import { DeleteItemDialog, EditItemDialog } from './components/EditItemDialog';
import type { LinkState } from './components/FileCard';
import { ReviewActions } from './components/ReviewActions';
import { StarButton } from './components/StarButton';
import { isNew, linkPlace, moduleTag, sizeLabel, statusInfo } from './display';
import { KIND_BY_ID, formatOf } from './kinds';
import type { LibraryItem } from './types';
import { useStar } from './useStar';
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
  const item = useLibraryItem(fileId);
  const notFound = item.isError && isApiError(item.error) && (item.error.status === 404 || item.error.status === 422);
  useDocumentTitle(item.data ? item.data.title : notFound ? 'File not found' : null);

  if (item.isPending) return <ViewerSkeleton />;
  if (item.isError) {
    return (
      <Page>
        <Panel padding="none">
          {notFound ? (
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
          ) : (
            <EmptyState
              icon={WarningCircle}
              title="This file didn’t load"
              body="Check your connection, then try again."
              action={<Button onClick={() => void item.refetch()}>Try again</Button>}
            />
          )}
        </Panel>
      </Page>
    );
  }
  return <FileView key={item.data.id} item={item.data} />;
}

/** What the uploader (or a moderator) sees above an item that isn't public. */
function StatusBanner({ item, onEdit, onDelete }: { item: LibraryItem; onEdit: () => void; onDelete: () => void }) {
  const { isModerator } = useAuth();
  const status = statusInfo(item.status);
  if (!status) return null;
  const who = item.uploadedBy?.displayName;
  return (
    <div className={cx('lib-status', `lib-status--${item.status}`)} role="status" data-hub="file-status">
      <div className="lib-status__text">
        <Badge tone={status.tone} size="sm">
          {status.label}
        </Badge>
        {item.status === 'pending' ? (
          <p>
            {item.isMine
              ? 'A student rep checks every upload before it’s public. Until then only you and the reps can see this page. You can still edit the details or delete it.'
              : `${who ?? 'A student'} uploaded this ${timeAgo(item.createdAt)}. Check it, then publish it or tell them why not.`}
          </p>
        ) : item.status === 'rejected' ? (
          <p>
            {item.reviewNote ? (
              <>
                <strong>Note from the student rep:</strong> {item.reviewNote}
              </>
            ) : (
              'A student rep decided not to publish this file.'
            )}
          </p>
        ) : (
          <p>This file was removed from the library.</p>
        )}
      </div>
      {item.status === 'pending' && isModerator ? (
        <ReviewActions item={item} className="lib-status__review" />
      ) : item.isMine && item.status !== 'removed' ? (
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

function FileView({ item }: { item: LibraryItem }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { push } = useToast();
  const { isModerator } = useAuth();
  const { getModule } = useModules();
  const toggleStar = useStar();
  const isDesktop = useMediaQuery(BREAKPOINTS.desktop);
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const wide = useMediaQuery('(min-width: 1280px)');
  const [metaPref, setMetaPref] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);

  const state = location.state as Partial<LinkState> | null;
  const backTo = typeof state?.from === 'string' ? state.from : '/library';
  const linkState = useMemo<LinkState>(() => ({ from: backTo }), [backTo]);
  const m = getModule(item.moduleId);
  const kind = KIND_BY_ID[item.kind];
  const fmt = formatOf(item);
  const isLink = item.source === 'link';
  const metaOpen = isDesktop ? (metaPref ?? wide) : true;
  // The uploader of an item that isn't public manages it from the status banner.
  const canManage = isModerator || (item.isMine && item.status === 'published');
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

  const copyLink = async () => {
    const url = new URL(`${import.meta.env.BASE_URL}${itemPath(item).slice(1)}`, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      push({ title: 'Link copied', body: 'Anyone can open this file with it.', tone: 'success' });
    } catch {
      push({ title: 'Couldn’t copy the link', body: url, tone: 'alert' });
    }
  };

  const moreItems = [
    ...(item.canEdit ? [{ id: 'edit', label: 'Edit details', icon: PencilSimple, onSelect: () => setDialog('edit') }] : []),
    ...((item.isMine || isModerator) && item.status !== 'removed'
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
          </span>
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
          {canManage && moreItems.length ? (
            <Menu align="end" label="More actions" items={moreItems} trigger={<IconButton label="More actions" icon={DotsThree} tooltip={isDesktop} />} />
          ) : null}
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

      {status ? <StatusBanner item={item} onEdit={() => setDialog('edit')} onDelete={() => setDialog('delete')} /> : null}

      <div className={cx('lib-viewer__body', isDesktop && metaOpen && 'has-meta')}>
        <div className="lib-viewer__canvas" role="region" aria-label={`${item.title}, preview`}>
          <Preview item={item} compact={isMobile} />
        </div>
        {metaOpen ? <MetaPanel id="lib-file-meta" item={item} linkState={linkState} className={isDesktop ? undefined : 'lib-meta--stacked'} /> : null}
      </div>

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
