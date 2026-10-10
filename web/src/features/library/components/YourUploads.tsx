import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useModules } from '../../../state/modules';
import { Badge, Button, PageSection, timeAgo } from '../../../ui';
import { itemPath, useLibraryList } from '../api';
import { moduleTag, statusInfo } from '../display';
import { kindLabel } from '../kinds';
import type { LibraryItem } from '../types';
import { DeleteItemDialog, EditItemDialog } from './EditItemDialog';
import type { LinkState } from './FileCard';
import { FileThumb } from './FileThumb';

function UploadRow({ item, linkState }: { item: LibraryItem; linkState?: LinkState }) {
  const { getModule } = useModules();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const status = statusInfo(item.status);
  const code = moduleTag(getModule(item.moduleId));
  return (
    <li className="lib-yours__row">
      <Link to={itemPath(item)} state={linkState} className="lib-yours__link">
        <FileThumb item={item} size="list" />
        <span className="lib-yours__text">
          <span className="lib-yours__name">{item.title}</span>
          <span className="lib-yours__meta">
            {code ? <span className="lib-yours__code">{code}</span> : null}
            <span>
              {kindLabel(item.kind)}, uploaded {timeAgo(item.createdAt)}
            </span>
          </span>
        </span>
      </Link>
      <span className="lib-yours__side">
        {status ? (
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
        ) : null}
        <span className="lib-yours__actions">
          {item.status === 'pending' && item.canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setDialog('edit')}>
              Edit
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setDialog('delete')}>
            Delete
          </Button>
        </span>
      </span>
      {item.status === 'rejected' ? (
        <p className="lib-yours__note">
          {item.reviewNote ? (
            <>
              <span className="lib-yours__note-label">Note from the student rep:</span> {item.reviewNote}
            </>
          ) : (
            'A student rep decided not to publish this one.'
          )}
        </p>
      ) : null}
      {dialog === 'edit' ? <EditItemDialog item={item} open onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? <DeleteItemDialog item={item} open onClose={() => setDialog(null)} /> : null}
    </li>
  );
}

/**
 * The signed-in student's uploads that aren't public: waiting for review, or not published (with the rep's
 * note). Renders nothing when there are none.
 */
export function YourUploads({ linkState, onShowAll }: { linkState?: LinkState; onShowAll: () => void }) {
  const mine = useLibraryList({ mine: true }, { limit: 50 });
  const open = (mine.data?.items ?? []).filter((i) => i.status === 'pending' || i.status === 'rejected');
  if (!open.length) return null;
  const pending = open.filter((i) => i.status === 'pending').length;
  return (
    <PageSection className="lib-yours" aria-labelledby="lib-yours-title" data-hub="your-uploads">
      <div className="lib-yours__head">
        <div>
          <h2 id="lib-yours-title" className="lib-yours__title">
            Your uploads
          </h2>
          <p className="lib-yours__desc">
            {pending
              ? `${pending === 1 ? 'One upload is' : `${pending} uploads are`} waiting for review. A student rep checks every upload before it’s public; until then only you and the reps can see it.`
              : open.length === 1
                ? 'A student rep didn’t publish this one. Their note says why.'
                : 'A student rep didn’t publish these. Their notes say why.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onShowAll}>
          All your uploads
        </Button>
      </div>
      <ul className="lib-yours__list" role="list">
        {open.map((item) => (
          <UploadRow key={item.id} item={item} linkState={linkState} />
        ))}
      </ul>
    </PageSection>
  );
}
