// Moderators: uploads waiting for review (GET /library/items?status=pending), oldest first, each with a
// preview, a download, Edit details, Publish and Reject (with a note the uploader sees).
// Rendered by features/moderation/ModerationPage.
import { ArrowSquareOut, CheckCircle, DownloadSimple, Eye, PencilSimple, WarningCircle } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useModules } from '../../state/modules';
import { Badge, Button, CohortBadge, EmptyState, Panel, Skeleton, timeAgo } from '../../ui';
import { downloadHref, itemPath, openLinkHref, useLibraryList } from './api';
import { EditItemDialog } from './components/EditItemDialog';
import { FileThumb } from './components/FileThumb';
import { ReviewActions } from './components/ReviewActions';
import { examLabel, linkPlace } from './display';
import { formatOf, formatSize, kindLabel } from './kinds';
import type { LibraryItem } from './types';
import './UploadsQueue.css';

function QueueRow({ item }: { item: LibraryItem }) {
  const { getModule } = useModules();
  const [editing, setEditing] = useState(false);
  const m = getModule(item.moduleId);
  const fmt = formatOf(item);
  const exam = examLabel(item);
  const who = item.uploadedBy;
  return (
    <li className="lib-queue__row" data-hub="upload-review">
      <FileThumb item={item} size="related" className="lib-queue__thumb" />
      <div className="lib-queue__main">
        <p className="lib-queue__module">
          {m ? (
            <>
              {m.unitCode ? <span className="lib-queue__code">{m.unitCode}</span> : null}
              <span>{m.unitCode ? m.shortName : m.name}</span>
            </>
          ) : (
            <span>Not about one module</span>
          )}
          {m || item.year ? <CohortBadge year={m?.year ?? item.year} size="sm" /> : null}
        </p>
        <h3 className="lib-queue__title">
          <Link to={itemPath(item)}>{item.title}</Link>
        </h3>
        <p className="lib-queue__facts">
          <span>{kindLabel(item.kind)}</span>
          {exam ? <span>{exam}</span> : null}
          {item.source === 'file' ? (
            <span className="lib-queue__file" title={item.fileName ?? undefined}>
              {item.fileName}
              {fmt || item.sizeBytes ? ` (${[fmt?.tag, formatSize(item.sizeBytes)].filter(Boolean).join(', ')})` : ''}
            </span>
          ) : (
            <span>Link to {linkPlace(item)}</span>
          )}
        </p>
        <p className="lib-queue__by">
          Uploaded by <strong>{who?.displayName ?? 'a former member'}</strong>
          {who?.year ? `, Year ${who.year}` : ''}, <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
          {item.authorName ? <> · credited to {item.authorName}</> : null}
        </p>
        {item.description ? <p className="lib-queue__desc">{item.description}</p> : null}
        <div className="lib-queue__links">
          <Button size="sm" variant="ghost" leadingIcon={Eye} to={itemPath(item)}>
            Preview
          </Button>
          {item.source === 'file' ? (
            <Button size="sm" variant="ghost" leadingIcon={DownloadSimple} href={downloadHref(item)}>
              Download
            </Button>
          ) : (
            <Button size="sm" variant="ghost" trailingIcon={ArrowSquareOut} href={openLinkHref(item)}>
              Open link
            </Button>
          )}
          <Button size="sm" variant="ghost" leadingIcon={PencilSimple} onClick={() => setEditing(true)}>
            Edit details
          </Button>
        </div>
      </div>
      <ReviewActions item={item} className="lib-queue__actions" />
      {editing ? <EditItemDialog item={item} open onClose={() => setEditing(false)} /> : null}
    </li>
  );
}

/** The library's review queue for moderators. */
export function UploadsQueue() {
  const { isModerator } = useAuth();
  const queue = useLibraryList({ status: 'pending' }, { limit: 100, enabled: isModerator });
  const items = useMemo(
    () => [...(queue.data?.items ?? [])].filter((i) => i.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [queue.data],
  );

  if (!isModerator) return null;

  let body;
  if (queue.isPending) {
    body = (
      <div className="lib-queue__loading" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="lib-queue__row">
            <Skeleton width={56} height={79} radius={2} />
            <Skeleton lines={3} />
          </div>
        ))}
      </div>
    );
  } else if (queue.isError) {
    body = (
      <EmptyState
        icon={WarningCircle}
        title="The review queue didn’t load"
        body="Check your connection, then try again."
        action={<Button onClick={() => void queue.refetch()}>Try again</Button>}
      />
    );
  } else if (!items.length) {
    body = <EmptyState icon={CheckCircle} title="No uploads waiting" body="When a student uploads a file, it waits here until a rep publishes it." />;
  } else {
    body = (
      <ol className="lib-queue__list" role="list">
        {items.map((item) => (
          <QueueRow key={item.id} item={item} />
        ))}
      </ol>
    );
  }

  return (
    <section className="lib-queue" aria-labelledby="lib-queue-title" data-hub="uploads-queue">
      <header className="lib-queue__head">
        <h2 id="lib-queue-title" className="lib-queue__h">
          Library uploads
          {items.length ? (
            <Badge tone="highlight" size="sm">
              {items.length} waiting
            </Badge>
          ) : null}
        </h2>
        <p className="lib-queue__intro">
          Publish files that are useful, in the right module, and something students may share. If you reject one, your note tells the
          uploader why.
        </p>
      </header>
      <Panel padding="none" className="lib-queue__panel">
        {body}
      </Panel>
    </section>
  );
}
