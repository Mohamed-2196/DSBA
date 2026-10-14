// /notes/:noteId (and /notes/new): one note in the editor. It opens at once, saves as the student types, and keeps an
// unsent copy on the device (useNoteEditor). On wide screens the preview sits beside the text; on smaller ones the
// editor's Write / Preview toggle shows it.
import { ArrowLeft, CheckCircle, CloudSlash, NotePencil, Trash, WarningCircle } from '@phosphor-icons/react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Gate, useAuth } from '../../auth';
import { BREAKPOINTS, useDocumentTitle, useMediaQuery } from '../../state';
import { Button, ConfirmDialog, EmptyState, IconButton, Page, Panel, QueryError, Skeleton, cx } from '../../ui';
import { MarkdownEditor, Prose } from '../forum/public';
import { useDeleteNote } from './api';
import { BODY_MAX, TITLE_MAX } from './limits';
import { noteLabel } from './draft';
import { PlacePicker } from './PlacePicker';
import { useNoteEditor, type NoteEditor, type SaveState } from './useNoteEditor';
import './Notes.css';

const STATUS: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Saving…',
  saving: 'Saving…',
  offline: 'Offline. Kept on this device',
  conflict: 'Changed elsewhere',
  error: 'Not saved',
};

function SaveStatus({ state }: { state: SaveState }) {
  const Icon = state === 'saved' ? CheckCircle : state === 'offline' ? CloudSlash : state === 'error' || state === 'conflict' ? WarningCircle : null;
  return (
    <p className={cx('notes-status', `is-${state}`)} role="status" aria-live="polite" data-hub="note-status">
      {Icon ? <Icon aria-hidden="true" /> : <span className="notes-status__dot" aria-hidden="true" />}
      {STATUS[state]}
    </p>
  );
}

function Notices({ editor, readOnly }: { editor: NoteEditor; readOnly: boolean }) {
  if (readOnly) {
    return (
      <p className="notes-notice" role="note">
        Your account is suspended. You can read your notes, but not change them.
      </p>
    );
  }
  if (editor.state === 'conflict' && editor.theirs) {
    return (
      <div className="notes-notice is-conflict" role="alert">
        <p>This note was changed in another tab or on another device. Which version do you want?</p>
        <div className="notes-notice__actions">
          <Button size="sm" variant="primary" onClick={editor.keepMine}>
            Keep mine
          </Button>
          <Button size="sm" onClick={editor.loadTheirs}>
            Load the other one
          </Button>
        </div>
      </div>
    );
  }
  if (editor.state === 'error') {
    return (
      <div className="notes-notice is-error" role="alert">
        <p>{editor.error ?? 'Your note couldn’t be saved.'} Your text is kept on this device.</p>
        <div className="notes-notice__actions">
          <Button size="sm" onClick={editor.flush}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  return null;
}

function Editor({ noteId, readOnly, onCreated }: { noteId: string | null; readOnly: boolean; onCreated: (id: string) => void }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const wide = useMediaQuery(BREAKPOINTS.desktop);
  const [place] = useState(() => {
    return { moduleId: params.get('module'), lessonId: params.get('lesson') };
  });
  const editor = useNoteEditor(noteId, { place, readOnly, onCreated });
  const remove = useDeleteNote();
  const [confirming, setConfirming] = useState(false);
  const { doc } = editor;
  const label = doc ? noteLabel(doc) : 'Note';
  useDocumentTitle(doc ? label : null);

  const onDelete = () => {
    const done = () => {
      editor.discard();
      navigate('/notes', { replace: true });
    };
    if (editor.id === null) return done();
    remove.mutate(editor.id, { onSuccess: done });
  };

  if (!doc) {
    if (editor.missing) {
      return (
        <Panel>
          <EmptyState icon={NotePencil} title="This note doesn’t exist" body="It may have been deleted." action={<Button to="/notes">See your notes</Button>} />
        </Panel>
      );
    }
    if (editor.loadError) return <QueryError error={editor.loadError} title="Your note didn’t load" />;
    return (
      <div className="notes-editor" aria-busy="true">
        <Skeleton height={44} />
        <Skeleton height={320} />
      </div>
    );
  }

  return (
    <div className="notes-editor" data-hub="note-editor">
      <div className="notes-editor__bar">
        <Button variant="ghost" size="sm" leadingIcon={ArrowLeft} to="/notes" onClick={editor.flush}>
          All notes
        </Button>
        <div className="notes-editor__bar-end">
          <SaveStatus state={readOnly ? 'saved' : editor.state} />
          {readOnly ? null : <IconButton icon={Trash} label="Delete note" tooltip onClick={() => setConfirming(true)} data-hub="note-delete" />}
        </div>
      </div>
      <Notices editor={editor} readOnly={readOnly} />
      <input
        className="notes-editor__title"
        aria-label="Title"
        placeholder="Title"
        value={doc.title}
        maxLength={TITLE_MAX}
        readOnly={readOnly}
        dir="auto"
        onChange={(e) => editor.change({ title: e.target.value })}
        data-hub="note-title"
      />
      <PlacePicker doc={doc} disabled={readOnly} onChange={editor.change} />
      <div className={cx('notes-editor__body', wide && 'is-split')}>
        <MarkdownEditor
          label="Note"
          hideLabel
          value={doc.body}
          onChange={(body) => editor.change({ body })}
          rows={18}
          preview={!wide}
          placeholder="Write your note. Use `code` for formulas, like `E[X] = Σ x p(x)`."
          autoFocus={noteId === null}
          textareaProps={{ maxLength: BODY_MAX, readOnly, dir: 'auto', 'data-hub': 'note-body' }}
          className="notes-editor__field"
        />
        {wide ? (
          <section className="notes-editor__preview" aria-label="Preview">
            {doc.body.trim() ? <Prose text={doc.body} /> : <p className="notes-editor__empty">The preview shows here as you write.</p>}
          </section>
        ) : null}
      </div>
      <p className="notes-editor__hint">Only you can see your notes. Markdown works: **bold**, *italic*, `code`, $formulas$, lists and links.</p>
      <ConfirmDialog
        open={confirming}
        title={`Delete “${label}”?`}
        body="It’s deleted everywhere, and it can’t be undone."
        confirmLabel="Delete"
        tone="danger"
        busy={remove.isPending}
        error={remove.error ? remove.error.message : null}
        onConfirm={onDelete}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}

function NoteEditorPage() {
  const { noteId: param } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const noteId = !param || param === 'new' ? null : param;
  // A new note keeps its editor when its first save gives it an address; opening another note starts a new one.
  const [session, setSession] = useState({ noteId, key: 0, created: null as string | null });
  if (session.noteId !== noteId) {
    setSession((s) => ({ noteId, key: noteId !== null && noteId === s.created ? s.key : s.key + 1, created: s.created }));
  }
  const onCreated = useCallback(
    (id: string) => {
      setSession((s) => ({ ...s, created: id }));
      navigate(`/notes/${id}`, { replace: true });
    },
    [navigate],
  );
  return (
    <Page width="wide">
      <Editor key={session.key} noteId={noteId} readOnly={me?.status === 'suspended'} onCreated={onCreated} />
    </Page>
  );
}

export default function NotePage() {
  return (
    <Gate title="Notes" description="Your own notes, saved as you type." signedIn>
      <NoteEditorPage />
    </Gate>
  );
}
