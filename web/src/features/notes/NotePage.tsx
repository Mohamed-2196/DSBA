// /notes/:noteId (and /notes/new): the Notability-style notebook editor.
// Mixes rich text, vector handwriting, pictures, attached files, and imported PDFs with zoom, pan,
// palm rejection, laser pointer, lasso selection, and high-fidelity PDF export.
import {
  ArrowLeft,
  ArrowsIn,
  ArrowsOut,
  CheckCircle,
  CloudSlash,
  DownloadSimple,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  NotePencil,
  Plus,
  SquaresFour,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { EditorContent } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { uploadFile } from '../../api/uploads';
import { Gate, useAuth } from '../../auth';
import { useDocumentTitle, useToast } from '../../state';
import { Button, ConfirmDialog, EmptyState, IconButton, QueryError, Skeleton, cx } from '../../ui';
import { useCreateNote, useDeleteNote } from './api';
import { EMPTY_DOC, noteLabel, type Paper } from './draft';
import { TITLE_MAX } from './limits';
import { usePdf } from './pdf';
import { PlacePicker } from './PlacePicker';
import { fitZoom, sheetsOf } from './surface/layout';
import { Surface } from './surface/Surface';
import { DEFAULT_PENS, TOOL_KEYS, type PenSettings, type Tool } from './surface/tools';
import { useNoteText } from './text/useNoteText';
import { Toolbar } from './Toolbar';
import { useInkSync } from './useInkSync';
import { useNoteEditor, type NoteEditor, type SaveState } from './useNoteEditor';
import { emptyHistory, record, redo, undo, type InkHistory, type InkStroke } from '../../lib/ink';
import './Notes.css';

const STATUS: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Saving…',
  saving: 'Saving…',
  offline: 'Offline · Kept on this device',
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

function NoteWorkspace({ noteId, readOnly }: { noteId: string; readOnly: boolean }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const editor = useNoteEditor(noteId, { readOnly });
  const inkSync = useInkSync(noteId, editor.note, { readOnly });
  const pdf = usePdf(editor.note?.pdf);
  const remove = useDeleteNote();

  const [confirming, setConfirming] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>('type');
  const [pens, setPens] = useState<PenSettings>(DEFAULT_PENS);
  const [fingerDraws, setFingerDraws] = useState(true);
  const [stylusSeen, setStylusSeen] = useState(false);
  const [history, setHistory] = useState<InkHistory>(emptyHistory);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<'picture' | 'file'>('picture');

  const { doc } = editor;
  const label = doc ? noteLabel(doc) : 'Note';
  useDocumentTitle(doc ? label : null);

  // Auto-fit zoom to available screen width on load
  useEffect(() => {
    if (!scrollerRef.current) return;
    const available = scrollerRef.current.clientWidth;
    if (available > 300) setZoom(fitZoom(available));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const next = TOOL_KEYS[e.key.toLowerCase()];
      if (next) setTool(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const isImg = file.type.startsWith('image/');
          const out = await uploadFile('note_file', file);
          if (isImg) {
            textEditor?.commands.insertNotePicture({ upload: out.uploadId, alt: file.name });
          } else {
            textEditor?.commands.insertNoteFile({ upload: out.uploadId, name: file.name, size: file.size });
          }
        } catch {
          push({ title: 'Failed to upload attachment.', tone: 'alert' });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [push],
  );

  const textEditor = useNoteText({
    doc: doc?.doc ?? null,
    readOnly,
    onChange: (richDoc, plain) => {
      editor.change({ doc: richDoc });
      editor.setPlainText(plain);
    },
    onReady: (plain) => editor.setPlainText(plain),
    onFiles: handleUploadFiles,
  });

  const onInkChange = useCallback(
    (sheet: number, before: readonly InkStroke[], after: readonly InkStroke[]) => {
      setHistory((h) => record(h, { sheet, before, after }));
      inkSync.setSheet(sheet, after);
    },
    [inkSync],
  );

  const onUndo = useCallback(() => {
    if (tool === 'type' && textEditor) {
      textEditor.commands.undo();
      return;
    }
    const res = undo(history);
    if (res) {
      setHistory(res.history);
      inkSync.setSheet(res.sheet, res.strokes);
    }
  }, [tool, textEditor, history, inkSync]);

  const onRedo = useCallback(() => {
    if (tool === 'type' && textEditor) {
      textEditor.commands.redo();
      return;
    }
    const res = redo(history);
    if (res) {
      setHistory(res.history);
      inkSync.setSheet(res.sheet, res.strokes);
    }
  }, [tool, textEditor, history, inkSync]);

  const onPicture = useCallback(() => {
    uploadModeRef.current = 'picture';
    if (fileInputRef.current) {
      fileInputRef.current.accept = 'image/*';
      fileInputRef.current.click();
    }
  }, []);

  const onFile = useCallback(() => {
    uploadModeRef.current = 'file';
    if (fileInputRef.current) {
      fileInputRef.current.accept = '*/*';
      fileInputRef.current.click();
    }
  }, []);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    if (files.length) void handleUploadFiles(files);
    e.target.value = '';
  };

  const onDelete = () => {
    editor.discard();
    remove.mutate(noteId, {
      onSuccess: () => navigate('/notes', { replace: true }),
    });
  };

  const sheets = useMemo(() => {
    const pages = pdf.state.status === 'ready' ? pdf.state.pdf.pages : [];
    return sheetsOf(pages, doc?.sheets ?? 1);
  }, [pdf.state, doc?.sheets]);

  if (!doc) {
    if (editor.missing) {
      return (
        <div className="nb-workspace">
          <EmptyState icon={NotePencil} title="This note doesn’t exist" body="It may have been deleted." action={<Button to="/notes">See all notes</Button>} />
        </div>
      );
    }
    if (editor.loadError) return <QueryError error={editor.loadError} title="Your note didn’t load" />;
    return (
      <div className="nb-workspace" aria-busy="true">
        <div className="notes-skeleton">
          <Skeleton height={44} />
          <Skeleton height={400} />
        </div>
      </div>
    );
  }

  const papers: { value: Paper; label: string }[] = [
    { value: 'lined', label: 'Lined' },
    { value: 'grid', label: 'Grid' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'blank', label: 'Blank' },
  ];

  return (
    <div className={cx('nb-workspace', fullscreen && 'is-fullscreen')} data-hub="notebook-workspace">
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={onFileInputChange} />

      {/* ── Persistent Header ── */}
      <header className="nb-header" role="banner" data-hub="notebook-header">
        <div className="nb-header__start">
          <Button variant="ghost" size="sm" leadingIcon={ArrowLeft} to="/notes" onClick={editor.flush}>
            Notes
          </Button>
          <div className="nb-header__crumbs">
            <PlacePicker doc={doc} disabled={readOnly} onChange={editor.change} />
            <span>›</span>
          </div>
          <input
            className="nb-header__title"
            aria-label="Title"
            placeholder="Untitled note"
            value={doc.title}
            maxLength={TITLE_MAX}
            readOnly={readOnly}
            dir="auto"
            onChange={(e) => editor.change({ title: e.target.value })}
            data-hub="note-title"
          />
        </div>
        <div className="nb-header__end">
          <SaveStatus state={readOnly ? 'saved' : editor.state === 'saving' || inkSync.state === 'saving' ? 'saving' : editor.state} />
          <div className="nb-choice" role="radiogroup" aria-label="Paper style">
            {papers.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={doc.paper === p.value}
                className={cx('nb-choice__item', doc.paper === p.value && 'is-active')}
                onClick={() => editor.change({ paper: p.value })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <IconButton
            icon={SquaresFour}
            label={showPages ? 'Hide page thumbnails' : 'Show page thumbnails'}
            toggle
            active={showPages}
            onClick={() => setShowPages(!showPages)}
            tooltip
          />
          <IconButton icon={MagnifyingGlassMinus} label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))} tooltip />
          <IconButton icon={MagnifyingGlassPlus} label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))} tooltip />
          <IconButton icon={DownloadSimple} label="Export as PDF" onClick={() => window.print()} tooltip />
          <IconButton
            icon={fullscreen ? ArrowsIn : ArrowsOut}
            label={fullscreen ? 'Exit full screen' : 'Full screen writing'}
            onClick={() => setFullscreen(!fullscreen)}
            tooltip
          />
          {readOnly ? null : <IconButton icon={Trash} label="Delete note" tooltip onClick={() => setConfirming(true)} data-hub="note-delete" />}
        </div>
      </header>

      <Notices editor={editor} readOnly={readOnly} />

      {/* ── Top Toolbar ── */}
      <Toolbar
        tool={tool}
        onTool={setTool}
        pens={pens}
        onPens={setPens}
        editor={textEditor}
        canType={doc.sheets > 0}
        canUndo={tool === 'type' ? !!textEditor?.can().undo() : history.past.length > 0}
        canRedo={tool === 'type' ? !!textEditor?.can().redo() : history.future.length > 0}
        onUndo={onUndo}
        onRedo={onRedo}
        onPicture={onPicture}
        onFile={onFile}
        fingerDraws={fingerDraws}
        onFingerDraws={setFingerDraws}
        stylusSeen={stylusSeen}
        readOnly={readOnly}
      />

      {/* ── Main Workspace Body: Thumbnails Drawer + Surface ── */}
      <div className="nb-body">
        {showPages ? (
          <aside className="nb-pages-drawer" aria-label="Page thumbnails">
            <h4 className="nb-pages-drawer__title">Pages ({sheets.length})</h4>
            {sheets.map((s, idx) => (
              <button
                key={s.index}
                type="button"
                className="nb-page-thumb"
                onClick={() => {
                  const el = scrollerRef.current?.querySelector(`[data-sheet="${s.index}"]`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <span className="nb-page-thumb__num">
                  {s.kind === 'pdf' ? `PDF Page ${s.page}` : `Paper Sheet ${idx + 1}`}
                </span>
              </button>
            ))}
            {readOnly ? null : (
              <Button size="sm" variant="secondary" leadingIcon={Plus} onClick={() => editor.change({ sheets: doc.sheets + 1 })}>
                Add sheet
              </Button>
            )}
          </aside>
        ) : null}

        <div ref={scrollerRef} className="nb-scroller" data-hub="notebook-scroller">
          <Surface
            sheets={sheets}
            paper={doc.paper}
            zoom={zoom}
            onZoom={(nextZoom) => setZoom(nextZoom)}
            tool={tool}
            onTool={setTool}
            pens={pens}
            fingerDraws={fingerDraws}
            onStylus={() => {
              setStylusSeen(true);
              setFingerDraws(false);
            }}
            strokesOf={inkSync.strokesOf}
            revision={inkSync.revision}
            onInk={onInkChange}
            pdf={pdf.state.status === 'ready' ? pdf.state.pdf : null}
            text={textEditor ? <EditorContent editor={textEditor} /> : null}
            footer={
              readOnly ? null : (
                <Button variant="secondary" leadingIcon={Plus} onClick={() => editor.change({ sheets: doc.sheets + 1 })} data-hub="add-page">
                  Add a page
                </Button>
              )
            }
            readOnly={readOnly}
            scrollerRef={scrollerRef}
            onTextHeight={() => {
              /* text flows down paper sheets */
            }}
          />
        </div>
      </div>

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

function NewNoteRedirect() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const create = useCreateNote();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    create.mutate(
      {
        title: '',
        doc: EMPTY_DOC,
        moduleId: params.get('module'),
        lessonId: params.get('lesson'),
        paper: 'lined',
        sheets: 1,
      },
      {
        onSuccess: (note) => navigate(`/notes/${note.id}`, { replace: true }),
        onError: () => navigate('/notes', { replace: true }),
      },
    );
  }, [create, navigate, params]);

  return (
    <div className="nb-workspace" aria-busy="true">
      <div className="notes-skeleton">
        <Skeleton height={44} />
        <Skeleton height={400} />
      </div>
    </div>
  );
}

export default function NotePage() {
  const { noteId } = useParams();
  const { me } = useAuth();
  const readOnly = me?.status === 'suspended';

  if (!noteId || noteId === 'new') {
    return (
      <Gate title="Notes" description="Your own notes, saved as you type." signedIn>
        <NewNoteRedirect />
      </Gate>
    );
  }

  return (
    <Gate title="Notes" description="Your own notes, saved as you type." signedIn>
      <NoteWorkspace key={noteId} noteId={noteId} readOnly={readOnly} />
    </Gate>
  );
}
