// /notes/:noteId (and /notes/new): the notebook editor. A note is typed text, handwriting, pictures and files on
// ruled paper, optionally written over a PDF. The header says where it is kept and whether it is saved there; the
// toolbar holds the tools; the pages scroll and zoom under them, the app's rail and bar can make way (full screen).
import { NotePencil, X } from '@phosphor-icons/react';
import { EditorContent } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { UPLOAD_RULES } from '../../api/uploads';
import { Gate, useAuth } from '../../auth';
import { useDocumentTitle, useLocalStorage, useMediaQuery } from '../../state';
import { Button, ConfirmDialog, EmptyState, QueryError, Skeleton, cx } from '../../ui';
import { deleteNote, useCreateNote, useDeleteNote } from './api';
import { EMPTY_DOC, noteLabel, type NoteDoc } from './draft';
import { NoteHeader } from './NoteHeader';
import { PagesDrawer, type PageAction } from './PagesDrawer';
import { usePdf } from './pdf';
import { PrintNote } from './print/PrintNote';
import { combinedState } from './saveState';
import { LINE, PAPER_BASE, paperFor, sheetsOf, textSheets } from './surface/layout';
import { Surface } from './surface/Surface';
import { DEFAULT_PENS, PENS_KEY, TOOL_KEYS, asPens, type PenSettings, type Tool } from './surface/tools';
import { useZoom } from './surface/useZoom';
import { useNoteText } from './text/useNoteText';
import type { SheetChange, Step } from './timeline';
import { Toolbar } from './Toolbar';
import { useInkSync, type InkSync } from './useInkSync';
import { useNoteEditor, type NoteEditor } from './useNoteEditor';
import { useNoteUploads } from './useNoteUploads';
import { useTimeline } from './useTimeline';
import './Notes.css';

const STYLUS_KEY = 'hub.mine.notes.stylus';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function Notices({
  editor,
  ink,
  readOnly,
  pdfFailed,
  onPdfRetry,
}: {
  editor: NoteEditor;
  ink: InkSync;
  readOnly: boolean;
  pdfFailed: boolean;
  onPdfRetry: () => void;
}) {
  const out = [];
  if (readOnly) {
    out.push(
      <p key="ro" className="nb-notice" role="note">
        Your account is suspended. You can read your notes, but not change them.
      </p>,
    );
  }
  if (editor.state === 'conflict' && editor.theirs) {
    out.push(
      <div key="text" className="nb-notice is-alert" role="alert">
        <p>This note’s text was changed in another tab or on another device. Which version do you want to keep?</p>
        <div className="nb-notice__actions">
          <Button size="sm" variant="primary" onClick={editor.keepMine}>
            Keep mine
          </Button>
          <Button size="sm" onClick={editor.loadTheirs}>
            Load the other one
          </Button>
        </div>
      </div>,
    );
  }
  if (ink.conflicts.length) {
    const pages = ink.conflicts.length === 1 ? 'A page was' : `${ink.conflicts.length} pages were`;
    out.push(
      <div key="ink" className="nb-notice is-alert" role="alert">
        <p>{pages} written on in another tab or on another device. Which handwriting do you want to keep?</p>
        <div className="nb-notice__actions">
          <Button size="sm" variant="primary" onClick={ink.keepMine}>
            Keep mine
          </Button>
          <Button size="sm" onClick={ink.loadTheirs}>
            Load the other one
          </Button>
        </div>
      </div>,
    );
  }
  for (const [key, failed] of [
    ['text', editor.state === 'error' ? (editor.error ?? 'Your note’s text couldn’t be saved.') : null],
    ['inkerr', ink.state === 'error' ? (ink.error ?? 'Your handwriting couldn’t be saved.') : null],
  ] as const) {
    if (!failed) continue;
    out.push(
      <div key={key} className="nb-notice is-alert" role="alert">
        <p>{failed} It’s kept on this device.</p>
        <div className="nb-notice__actions">
          <Button size="sm" onClick={key === 'text' ? editor.flush : ink.flush}>
            Try again
          </Button>
        </div>
      </div>,
    );
  }
  if (ink.load === 'failed') {
    out.push(
      <div key="load" className="nb-notice is-alert" role="alert">
        <p>Your handwriting didn’t load, so writing is paused. Check your connection.</p>
        <div className="nb-notice__actions">
          <Button size="sm" onClick={ink.retryLoad}>
            Try again
          </Button>
        </div>
      </div>,
    );
  }
  if (pdfFailed) {
    out.push(
      <div key="pdf" className="nb-notice is-alert" role="alert">
        <p>The PDF didn’t open. Your writing on it is safe.</p>
        <div className="nb-notice__actions">
          <Button size="sm" onClick={onPdfRetry}>
            Try again
          </Button>
        </div>
      </div>,
    );
  }
  return out.length ? <div className="nb-notices">{out}</div> : null;
}

function UploadTray({ uploads }: { uploads: ReturnType<typeof useNoteUploads>['pending'] }) {
  if (!uploads.length) return null;
  return (
    <ul className="nb-uploads" aria-label="Uploading" data-hub="note-uploads">
      {uploads.map((u) => (
        <li key={u.id}>
          <span className="nb-uploads__name">{u.name}</span>
          <span className="nb-uploads__bar" aria-hidden="true">
            <span style={{ width: `${u.percent}%` }} />
          </span>
          <span className="nb-uploads__pct">{u.percent}%</span>
          <button type="button" onClick={u.cancel} aria-label={`Stop uploading ${u.name}`} title="Stop">
            <X aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The note, loaded (from the server or the copy on this device), then the editor on it. */
function NoteWorkspace({ noteId, readOnly, fresh }: { noteId: string; readOnly: boolean; fresh: boolean }) {
  const editor = useNoteEditor(noteId, { readOnly });
  const ink = useInkSync(noteId, editor.note, { readOnly });
  const pdf = usePdf(editor.note?.pdf);
  if (!editor.doc) {
    if (editor.missing) {
      return (
        <div className="nb nb--message">
          <EmptyState
            icon={NotePencil}
            title="This note doesn’t exist"
            body="It may have been deleted."
            action={<Button to="/notes">See all notes</Button>}
          />
        </div>
      );
    }
    if (editor.loadError) return <QueryError error={editor.loadError} title="Your note didn’t load" />;
    return (
      <div className="nb nb--message" aria-busy="true">
        <div className="nb-skeleton">
          <Skeleton height={44} />
          <Skeleton height={400} />
        </div>
      </div>
    );
  }
  return (
    <NoteDesk noteId={noteId} readOnly={readOnly} fresh={fresh} editor={editor} doc={editor.doc} ink={ink} pdf={pdf} />
  );
}

interface NoteDeskProps {
  noteId: string;
  readOnly: boolean;
  fresh: boolean;
  editor: NoteEditor;
  doc: NoteDoc;
  ink: InkSync;
  pdf: ReturnType<typeof usePdf>;
}

/** The editor, made once the note's document is in hand: the text starts with it, so nothing empty is ever saved. */
function NoteDesk({ noteId, readOnly, fresh, editor, doc, ink, pdf }: NoteDeskProps) {
  const navigate = useNavigate();
  const remove = useDeleteNote();
  const touch = useMediaQuery('(any-pointer: coarse)');

  const [confirming, setConfirming] = useState(false);
  const [full, setFull] = useState(false);
  const [pagesShown, setPagesShown] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [tool, setTool] = useState<Tool>('type');
  const [storedPens, setStoredPens] = useLocalStorage<unknown>(PENS_KEY, DEFAULT_PENS);
  const pens = useMemo(() => asPens(storedPens), [storedPens]);
  const [stylusSeen, setStylusSeen] = useLocalStorage<boolean>(STYLUS_KEY, false);
  const [fingerDraws, setFingerDraws] = useState(!stylusSeen);
  const [textHeight, setTextHeight] = useState(0);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scroller, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const setScroller = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    setScrollerEl(el);
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoom = useZoom(scroller);

  const label = noteLabel(doc);
  useDocumentTitle(label);
  const inkReadOnly = readOnly || ink.load !== 'ready';

  // ── the text, pictures and files ──
  const timelineRef = useRef<{ undo: () => void; redo: () => void }>({ undo: () => undefined, redo: () => undefined });
  const uploadsRef = useRef<(files: File[], at: number | null) => void>(() => undefined);
  const textEditor = useNoteText({
    doc: doc.doc,
    readOnly,
    onChange: (richDoc, plain) => {
      editor.change({ doc: richDoc });
      editor.setPlainText(plain);
    },
    onReady: (plain) => editor.setPlainText(plain),
    onFiles: (files, at) => uploadsRef.current(files, at),
    onUndo: () => timelineRef.current.undo(),
    onRedo: () => timelineRef.current.redo(),
  });
  const uploads = useNoteUploads(textEditor);
  useEffect(() => {
    uploadsRef.current = (files, at) => void uploads.add(files, at);
  }, [uploads]);

  // ── undo and redo, text and ink together ──
  const applyInk = useCallback(
    (step: Extract<Step, { kind: 'ink' }>, how: 'undo' | 'redo') => {
      for (const c of step.changes) ink.setSheet(c.sheet, how === 'undo' ? c.before : c.after);
      if (step.paper) editor.change({ sheets: how === 'undo' ? step.paper.before : step.paper.after });
    },
    [ink, editor],
  );
  const history = useTimeline(textEditor, applyInk);
  useEffect(() => {
    timelineRef.current = { undo: history.undo, redo: history.redo };
  }, [history.undo, history.redo]);
  const onInk = useCallback(
    (step: Step) => {
      if (step.kind !== 'ink') return;
      history.record(step);
      for (const c of step.changes) ink.setSheet(c.sheet, c.after);
      if (step.paper) editor.change({ sheets: step.paper.after });
    },
    [history, ink, editor],
  );

  // ── keys: tools by letter, undo and redo outside the text, Escape leaves full screen ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
        if (isTyping(e.target) || readOnly) return;
        e.preventDefault();
        if (e.key === 'y' || e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (e.key === 'Escape' && full && !document.querySelector('[aria-modal="true"], [role="menu"]')) {
        setFull(false);
        return;
      }
      if (mod || e.altKey || isTyping(e.target)) return;
      const next = TOOL_KEYS[e.key.toLowerCase()];
      if (next && (!readOnly || next === 'laser')) setTool(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, full, readOnly]);

  // ── the paper grows to hold the typed text ──
  const onTextHeight = useCallback((units: number) => setTextHeight(units), []);
  useEffect(() => {
    if (readOnly || doc.sheets === 0) return;
    const needed = paperFor(textHeight);
    if (needed > doc.sheets) editor.change({ sheets: needed });
  }, [textHeight, doc, readOnly, editor]);

  // Pressing the paper below the text while typing: the caret goes to that line, with empty lines before it.
  const onPaperPress = useCallback(
    (line: number) => {
      const ed = textEditor;
      if (!ed || readOnly) return;
      const lines = Math.max(1, Math.round(textHeight / LINE));
      if (line < lines) {
        ed.commands.focus('end');
        return;
      }
      const empty = Array.from({ length: Math.min(200, line - lines + 1) }, () => ({ type: 'paragraph' }));
      ed.chain().insertContentAt(ed.state.doc.content.size, empty).focus('end').run();
    },
    [textEditor, readOnly, textHeight],
  );

  // ── a new note left empty is deleted when the student leaves it ──
  const leftEmpty = useRef<() => boolean>(() => false);
  useEffect(() => {
    leftEmpty.current = () => {
      const d = editor.doc ?? doc;
      if (!fresh || d.title.trim() || textHeight > LINE + 1 || (textEditor && !textEditor.isEmpty)) return false;
      const paper = Array.from({ length: d.sheets }, (_, k) => PAPER_BASE + k);
      return paper.every((n) => ink.strokesOf(n).length === 0);
    };
  });
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discard = editor.discard;
  useEffect(() => {
    // React's development checks unmount and mount again at once: a mount cancels the deletion the unmount planned
    if (leaving.current) clearTimeout(leaving.current);
    leaving.current = null;
    return () => {
      leaving.current = setTimeout(() => {
        if (!leftEmpty.current()) return;
        discard();
        void deleteNote(noteId).catch(() => undefined);
      }, 0);
    };
  }, [noteId, discard]);

  // ── pictures and files from the toolbar ──
  const choose = useCallback((kind: 'picture' | 'file') => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = kind === 'picture' ? 'image/png,image/jpeg,image/webp,image/gif' : UPLOAD_RULES.note_file.accept;
    input.click();
  }, []);

  // ── pages ──
  const sheets = useMemo(() => {
    const pages = pdf.state.status === 'ready' ? pdf.state.pdf.pages : [];
    return sheetsOf(pages, doc.sheets);
  }, [pdf.state, doc.sheets]);
  // the pages the typed text is on (none while there is none)
  const typedPages = textEditor && !textEditor.isEmpty ? textSheets(textHeight) : 0;

  const onPage = useCallback(
    (action: PageAction) => {
      const scrollTo = (sheet: number) => {
        const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-sheet="${sheet}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      if (action.kind === 'go') {
        scrollTo(action.sheet);
        return;
      }
      if (action.kind === 'add') {
        onInk({ kind: 'ink', changes: [], paper: { before: doc.sheets, after: doc.sheets + 1 } });
        requestAnimationFrame(() => scrollTo(PAPER_BASE + doc.sheets));
        return;
      }
      const at = action.sheet - PAPER_BASE;
      const count = doc.sheets;
      const strokesAt = (k: number) => ink.strokesOf(PAPER_BASE + k);
      const changes: SheetChange[] = [];
      const change = (k: number, after: ReturnType<typeof strokesAt>) => {
        const before = strokesAt(k);
        if (before !== after) changes.push({ sheet: PAPER_BASE + k, before, after });
      };
      if (action.kind === 'clear') {
        change(at, []);
        onInk({ kind: 'ink', changes });
      } else if (action.kind === 'delete') {
        // the pages after it move up one, and the last one goes
        for (let k = at; k < count - 1; k++) change(k, strokesAt(k + 1));
        change(count - 1, []);
        onInk({ kind: 'ink', changes, paper: { before: count, after: Math.max(1, count - 1) } });
      } else if (action.kind === 'move') {
        const other = at + action.by;
        if (other < 0 || other >= count) return;
        const mine = strokesAt(at);
        change(at, strokesAt(other));
        change(other, mine);
        onInk({ kind: 'ink', changes });
        requestAnimationFrame(() => scrollTo(PAPER_BASE + other));
      }
    },
    [doc, ink, onInk],
  );

  // ── print: the pages laid out for paper, then the browser's print (Save as PDF) ──
  const onPrinted = useCallback(() => setPrinting(false), []);

  const onPdf = !!editor.note?.pdf;
  const pdfLoading = onPdf && pdf.state.status === 'loading';

  return (
    <div className={cx('nb', full && 'nb--full')} data-hub="notebook-workspace">
      <input
        type="file"
        ref={fileInputRef}
        hidden
        multiple
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void uploads.add(files, null);
        }}
        data-hub="note-file-input"
      />

      <NoteHeader
        doc={doc}
        note={editor.note}
        state={combinedState(editor.state, ink.state)}
        opening={ink.load === 'loading'}
        readOnly={readOnly}
        onChange={editor.change}
        onBack={editor.flush}
        pagesShown={pagesShown}
        onPages={() => setPagesShown((v) => !v)}
        onExport={() => setPrinting(true)}
        exporting={printing}
        full={full}
        onFull={() => setFull((v) => !v)}
        onDelete={() => setConfirming(true)}
      />

      <Toolbar
        tool={tool}
        onTool={setTool}
        pens={pens}
        onPens={(p: PenSettings) => setStoredPens(p)}
        editor={textEditor}
        canType={doc.sheets > 0}
        onAddPage={() => onPage({ kind: 'add' })}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onPicture={() => choose('picture')}
        onFile={() => choose('file')}
        touch={touch}
        fingerDraws={fingerDraws}
        onFingerDraws={setFingerDraws}
        zoom={zoom.zoom}
        fitted={zoom.fitted}
        onZoomStep={zoom.step}
        onFit={zoom.fit}
        readOnly={readOnly}
      />

      <Notices
        editor={editor}
        ink={ink}
        readOnly={readOnly}
        pdfFailed={onPdf && pdf.state.status === 'error'}
        onPdfRetry={pdf.retry}
      />

      <div className="nb-body">
        {pagesShown ? (
          <PagesDrawer
            sheets={sheets}
            pdf={pdf.state.status === 'ready' ? pdf.state.pdf : null}
            paper={doc.paper}
            strokesOf={ink.strokesOf}
            revision={ink.revision}
            typedPages={typedPages}
            readOnly={readOnly || inkReadOnly}
            scrollerRef={scrollerRef}
            onAction={onPage}
            onClose={() => setPagesShown(false)}
          />
        ) : null}
        <div ref={setScroller} className="nb-scroller" data-hub="notebook-scroller">
          {pdfLoading ? <p className="nb-scroller__note">Opening the PDF…</p> : null}
          <Surface
            sheets={sheets}
            paper={doc.paper}
            zoom={zoom.zoom}
            onZoom={zoom.zoomTo}
            tool={tool}
            onTool={setTool}
            pens={pens}
            fingerDraws={fingerDraws}
            onStylus={() => {
              if (!stylusSeen) setStylusSeen(true);
              setFingerDraws(false);
            }}
            strokesOf={ink.strokesOf}
            revision={ink.revision}
            onInk={onInk}
            pdf={pdf.state.status === 'ready' ? pdf.state.pdf : null}
            text={textEditor ? <EditorContent editor={textEditor} /> : null}
            onPaperPress={onPaperPress}
            footer={
              readOnly ? null : (
                <Button variant="secondary" onClick={() => onPage({ kind: 'add' })} data-hub="add-page">
                  Add a page
                </Button>
              )
            }
            readOnly={inkReadOnly}
            scroller={scroller}
            onTextHeight={onTextHeight}
          />
        </div>
        <UploadTray uploads={uploads.pending} />
      </div>

      {printing ? (
        <PrintNote
          title={label}
          sheets={sheets}
          paper={doc.paper}
          pdf={pdf.state.status === 'ready' ? pdf.state.pdf : null}
          strokesOf={ink.strokesOf}
          textSource={scrollerRef}
          onDone={onPrinted}
        />
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={`Delete “${label}”?`}
        body="Its text, handwriting, pictures and files are deleted everywhere. This can’t be undone."
        confirmLabel="Delete"
        tone="danger"
        busy={remove.isPending}
        error={remove.error ? remove.error.message : null}
        onConfirm={() => {
          editor.discard();
          remove.mutate(noteId, { onSuccess: () => navigate('/notes', { replace: true }) });
        }}
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
    const notebookId = params.get('notebook');
    const moduleId = params.get('module');
    create.mutate(
      {
        title: '',
        doc: EMPTY_DOC,
        ...(notebookId ? { notebookId } : { moduleId, lessonId: params.get('lesson') }),
        paper: 'lined',
        sheets: 1,
      },
      {
        onSuccess: (note) => navigate(`/notes/${note.id}`, { replace: true, state: { fresh: true } }),
        onError: () => navigate('/notes', { replace: true }),
      },
    );
  }, [create, navigate, params]);

  return (
    <div className="nb nb--message" aria-busy="true">
      <div className="nb-skeleton">
        <Skeleton height={44} />
        <Skeleton height={400} />
      </div>
    </div>
  );
}

export default function NotePage() {
  const { noteId } = useParams();
  const { me } = useAuth();
  const location = useLocation();
  const readOnly = me?.status === 'suspended';
  const fresh = !!(location.state as { fresh?: boolean } | null)?.fresh;

  return (
    <Gate title="Notes" description="Your own notes, saved as you write." signedIn>
      {!noteId || noteId === 'new' ? (
        <NewNoteRedirect />
      ) : (
        <NoteWorkspace key={noteId} noteId={noteId} readOnly={readOnly} fresh={fresh} />
      )}
    </Gate>
  );
}
