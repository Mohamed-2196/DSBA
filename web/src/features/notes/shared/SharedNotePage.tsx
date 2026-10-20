// /notes/shared/:shareId: a note a student shared with their module (IDEA-29), for anyone who may read the module.
// The band says whose it is ("Shared by Reem · Year 3", or "a student") and when; then the note, read only. Its writer
// may open their note or stop sharing; anyone signed in may report it; a student rep (library.manage) hides it with a
// reason the writer reads, or shows it again. A hidden one says so to the two who still see it.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage, isApiError } from '../../../api/errors';
import type { SharedNote } from '../../../api/types';
import { useDocumentTitle, useToast } from '../../../state';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  Page,
  QueryError,
  Skeleton,
  TextArea,
  glyph,
  timeAgo,
} from '../../../ui';
import { ReportButton } from '../../forum/public';
import { useModerateShared, useSharedNote, useUnshare } from './api';
import { SharedNoteView } from './SharedNoteView';
import { sharedByLine } from './words';
import './SharedNote.css';

const REASON_MAX = 500;

function Moderation({ copy }: { copy: SharedNote }) {
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState('');
  const moderate = useModerateShared(copy.id);
  const { push } = useToast();
  if (copy.hidden) {
    return (
      <Button
        size="sm"
        leadingIcon={<Icon glyph={glyph.eye} />}
        loading={moderate.isPending}
        onClick={() =>
          moderate.mutate(
            { hide: false },
            { onSuccess: () => push({ title: 'Shown in the module again', tone: 'success' }) },
          )
        }
        data-hub="shared-note-show"
      >
        Show again
      </Button>
    );
  }
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        leadingIcon={<Icon glyph={glyph.eyeOff} />}
        onClick={() => setHiding(true)}
        data-hub="shared-note-hide"
      >
        Hide
      </Button>
      <ConfirmDialog
        open={hiding}
        title="Hide this note from the module?"
        body={<p>Students stop seeing it. Its writer is told, with your reason, and still sees it.</p>}
        confirmLabel="Hide"
        tone="danger"
        busy={moderate.isPending}
        error={moderate.isError ? errorMessage(moderate.error, 'It wasn’t hidden. Try again.') : null}
        onConfirm={() =>
          moderate.mutate(
            { hide: true, reason: reason.trim() },
            {
              onSuccess: () => {
                setHiding(false);
                push({ title: 'Hidden from the module', body: 'Its writer gets a notification.', tone: 'success' });
              },
            },
          )
        }
        onClose={() => setHiding(false)}
      >
        <TextArea
          label="Why (optional)"
          hint="Its writer reads this."
          rows={2}
          value={reason}
          maxLength={REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
          dir="auto"
        />
      </ConfirmDialog>
    </>
  );
}

function WriterActions({ copy }: { copy: SharedNote }) {
  const [stopping, setStopping] = useState(false);
  const unshare = useUnshare();
  const navigate = useNavigate();
  const { push } = useToast();
  return (
    <>
      {copy.noteId ? (
        <Button size="sm" to={`/notes/${encodeURIComponent(copy.noteId)}`} leadingIcon={<Icon glyph={glyph.pen} />}>
          Open your note
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        leadingIcon={<Icon glyph={glyph.close} />}
        onClick={() => setStopping(true)}
        data-hub="shared-note-unshare"
      >
        Stop sharing
      </Button>
      <ConfirmDialog
        open={stopping}
        title="Stop sharing this note?"
        body={<p>The copy goes from {copy.moduleTitle}’s notes. Your note stays as it is.</p>}
        confirmLabel="Stop sharing"
        tone="danger"
        busy={unshare.isPending}
        error={unshare.isError ? errorMessage(unshare.error, 'It’s still shared. Try again.') : null}
        onConfirm={() =>
          unshare.mutate(
            { id: copy.id, noteId: copy.noteId ?? undefined },
            {
              onSuccess: () => {
                push({ title: 'No longer shared', body: 'Your note is still in your notebook.', tone: 'info' });
                navigate(copy.noteId ? `/notes/${encodeURIComponent(copy.noteId)}` : `/modules/${copy.moduleId}`);
              },
            },
          )
        }
        onClose={() => setStopping(false)}
      />
    </>
  );
}

export default function SharedNotePage() {
  const { shareId = '' } = useParams();
  const q = useSharedNote(shareId);
  useDocumentTitle(q.data ? q.data.title || 'Shared note' : 'Shared note');

  if (q.isError) {
    const gone = isApiError(q.error) && q.error.status === 404;
    return (
      <Page width="narrow" className="shn-page">
        {gone ? (
          <EmptyState
            icon={<Icon glyph={glyph.notebook} />}
            title="This shared note isn’t here"
            body="Its writer may have stopped sharing it, or a student rep hid it."
            action={<Button to="/modules">Go to modules</Button>}
          />
        ) : (
          <QueryError
            error={q.error}
            title="The note didn’t load"
            onRetry={() => void q.refetch()}
            retrying={q.isFetching}
          />
        )}
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page width="narrow" className="shn-page">
        <Skeleton height={120} radius={16} />
        <Skeleton height={480} radius={12} />
      </Page>
    );
  }
  const copy = q.data;
  const updated = copy.updatedAt !== copy.sharedAt;
  return (
    <Page className="shn-page" data-hub="shared-note-page">
      <Link to={`/modules/${encodeURIComponent(copy.moduleId)}`} className="shn-back">
        <Icon glyph={glyph.chevronLeft} />
        {copy.moduleTitle}
      </Link>
      <header className="shn-head" data-section="notebook">
        <p className="shn-head__kind">Students’ notes · {copy.moduleTitle}</p>
        <h1 className="shn-head__title" dir="auto">
          {copy.title || 'Untitled note'}
        </h1>
        <p className="shn-head__meta">
          <span data-hub="shared-note-by">{sharedByLine(copy)}</span>
          <span aria-hidden="true"> · </span>
          <time dateTime={copy.sharedAt}>{timeAgo(copy.sharedAt)}</time>
          {updated ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>
                updated <time dateTime={copy.updatedAt}>{timeAgo(copy.updatedAt)}</time>
              </span>
            </>
          ) : null}
          {copy.hidden ? (
            <Badge tone="alert" size="sm">
              Hidden
            </Badge>
          ) : null}
        </p>
        <div className="shn-head__actions">
          {copy.mine ? <WriterActions copy={copy} /> : <ReportButton targetType="shared_note" targetId={copy.id} />}
          {copy.canModerate ? <Moderation copy={copy} /> : null}
        </div>
      </header>
      {copy.hidden ? (
        <p className="shn-hidden" role="status">
          <Icon glyph={glyph.eyeOff} />
          {copy.mine
            ? 'A student rep hid this note from the module. Only you and the reps can see it.'
            : 'Hidden from the module. Only its writer and the reps can see it.'}
        </p>
      ) : null}
      <SharedNoteView copy={copy} />
      <p className="shn-foot">
        A copy shared by a student, as it was when they shared it. It isn’t checked by the reps first: if something’s
        wrong, report it.
      </p>
    </Page>
  );
}
