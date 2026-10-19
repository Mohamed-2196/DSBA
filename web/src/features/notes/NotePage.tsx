// /notes/:noteId: the notebook editor. A note is typed text, handwriting, pictures and files on
// ruled paper, optionally written over a PDF. The header says where it is kept and whether it is saved there; the
// toolbar holds the tools; the pages scroll and zoom under them, the app's rail and bar can make way (full screen).
// Pictures dropped or pasted onto the pages land free where they are dropped (or in the middle of the view); the
// toolbar's Picture puts one in the text, at the cursor.
import { NotePencil, X } from '@phosphor-icons/react';
import { EditorContent } from '@tiptap/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { UPLOAD_RULES } from '../../api/uploads';
import { Gate, useAuth } from '../../auth';
import { useDocumentTitle, useLocalStorage, useMediaQuery, useToast } from '../../state';
import { Button, ConfirmDialog, EmptyState, QueryError, Skeleton, cx } from '../../ui';
import { changePages, deleteNote, discardNote, useDeleteNote } from './api';
import { noteLabel, type NoteDoc } from './draft';
import { NoteHeader } from './NoteHeader';
import { pageMapping, repaged, undoOf, type PageMove } from './pages';
import { PagesDrawer, type PageAction } from './PagesDrawer';
import { usePdf } from './pdf';
import { inlinePictureCount, keepPictures, picturesOfDoc, withFreePictures } from './pictures/document';
import {
  MAX_PICTURES,
  freeFromInline,
  pictureWords,
  placedPicture,
  settle,
  type FreePicture,
} from './pictures/geometry';
import { PictureSpaceContext, type PictureSpace } from './pictures/space';
import { useFreePictures } from './pictures/useFreePictures';
import { PrintNote } from './print/PrintNote';
import { combinedState } from './saveState';
import {
  LINE,
  PAPER_BASE,
  SHEET_WIDTH,
  TEXT_WIDTH,
  layoutSheets,
  paperFor,
  sheetAt,
  sheetsOf,
  textSheets,
} from './surface/layout';
import { Surface } from './surface/Surface';
import { DEFAULT_PENS, PENS_KEY, TOOL_KEYS, asPens, type PenSettings, type Tool } from './surface/tools';
import { useZoom } from './surface/useZoom';
import { blockBoxes, dropTarget } from './text/blocks';
import { startWidth } from './text/picture';
import { useNoteText, type TextDrop } from './text/useNoteText';
import type { Step } from './timeline';
import { Toolbar } from './Toolbar';
import { useInkSync, type InkSync } from './useInkSync';
import { useNoteEditor, type NoteEditor } from './useNoteEditor';
import { isPicture, useNoteUploads, type Uploaded } from './useNoteUploads';
import { useTimeline } from './useTimeline';
import './Notebook.css';

const STYLUS_KEY = 'hub.mine.notes.stylus';
/** Whether resizing a free picture keeps its shape (each student's own choice, kept on this device). */
const KEEP_SHAPE_KEY = 'hub.mine.notes.keep-shape';
/** How far apart pictures dropped together land (units). */
const FAN = 24;

/** A spot on a sheet, in its units, where free pictures land. */
interface Spot {
  sheet: number;
  height: number;
  x: number;
  y: number;
}

/** Where added files go: pictures free at `free` (in the text when null), other files in the text at `at` (null: at
 *  the cursor). */
interface Where {
  free: Spot | null;
  at: number | null;
}

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function Notices({
  editor,
  ink,
  readOnly,
  pdfFailed,
  onPdfRetry,
  onLoaded,
}: {
  editor: NoteEditor;
  ink: InkSync;
  readOnly: boolean;
  pdfFailed: boolean;
  onPdfRetry: () => void;
  /** the other version was loaded: what was done before it can't be undone */
  onLoaded: () => void;
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
          <Button
            size="sm"
            onClick={() => {
              editor.loadTheirs();
              onLoaded();
            }}
          >
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
          <Button
            size="sm"
            onClick={() => {
              ink.loadTheirs();
              onLoaded();
            }}
          >
            Load the other one
          </Button>
        </div>
      </div>,
    );
  }
  for (const [key, failed, again] of [
    ['text', editor.state === 'error' ? (editor.error ?? 'Your note’s text couldn’t be saved.') : null, editor],
    ['inkerr', ink.state === 'error' ? (ink.error ?? 'Your handwriting couldn’t be saved.') : null, ink],
  ] as const) {
    if (!failed) continue;
    out.push(
      <div key={key} className="nb-notice is-alert" role="alert">
        <p>{failed} It’s kept on this device.</p>
        {again.retryable ? (
          <div className="nb-notice__actions">
            <Button size="sm" onClick={again.flush}>
              Try again
            </Button>
          </div>
        ) : null}
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

const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function MissingNote() {
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

/** The note, loaded (from the server or the copy on this device), then the editor on it. */
function NoteWorkspace({ noteId, readOnly, fresh }: { noteId: string; readOnly: boolean; fresh: boolean }) {
  const editor = useNoteEditor(noteId, { readOnly });
  const ink = useInkSync(noteId, editor.note, { readOnly });
  const pdf = usePdf(editor.note?.pdf);
  if (!editor.doc) {
    if (editor.missing) return <MissingNote />;
    if (editor.loadError)
      return <QueryError error={editor.loadError} title="Your note didn’t load" onRetry={editor.reload} />;
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
  const qc = useQueryClient();
  const remove = useDeleteNote();
  const touch = useMediaQuery('(any-pointer: coarse)');
  const { push } = useToast();

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
  const filesRef = useRef<(files: File[], drop: TextDrop | null) => void>(() => undefined);
  // what Mini Noora reads of the note: its text, then its free pictures' captions and descriptions
  const typed = useRef('');
  const pictureText = pictureWords(picturesOfDoc(doc.doc)).join('\n');
  const { change, latest, setPlainText } = editor;
  const publishText = useCallback(
    () => setPlainText([typed.current, pictureText].filter(Boolean).join('\n')),
    [setPlainText, pictureText],
  );
  useEffect(() => publishText(), [publishText]);
  const textEditor = useNoteText({
    doc: doc.doc,
    readOnly,
    onChange: (richDoc, plain) => {
      change((d) => ({ doc: keepPictures(richDoc, d.doc) }));
      typed.current = plain;
      publishText();
    },
    onReady: (plain) => {
      typed.current = plain;
      publishText();
    },
    onFiles: (files, drop) => filesRef.current(files, drop),
    onUndo: () => timelineRef.current.undo(),
    onRedo: () => timelineRef.current.redo(),
  });
  const uploads = useNoteUploads();
  const [keepShape, setKeepShape] = useLocalStorage<boolean>(KEEP_SHAPE_KEY, true);
  const writePictures = useCallback(
    (next: readonly FreePicture[]) => change((d) => ({ doc: withFreePictures(d.doc, next) })),
    [change],
  );

  // ── pages of paper added, deleted or moved: on the server at once (their ink and pictures go along), then here ──
  const [pagesBusy, setPagesBusy] = useState(false);
  const pagesBusyRef = useRef(false);
  const { run: runNote, base, adopt } = editor;
  const changePagesNow = useCallback(
    async (move: PageMove): Promise<boolean> => {
      if (readOnly || pagesBusyRef.current) return false;
      if (editor.state === 'conflict' || ink.conflicts.length) {
        push({ title: 'Choose which version to keep first', tone: 'alert' });
        return false;
      }
      pagesBusyRef.current = true;
      setPagesBusy(true);
      try {
        await runNote(() =>
          ink.run(async () => {
            const before = latest()?.sheets ?? doc.sheets;
            const note = await changePages(noteId, { ...move, version: base() });
            const map = pageMapping(move, before);
            ink.renumber(map);
            adopt(note, (d) => ({
              sheets: note.sheets,
              doc: withFreePictures(d.doc, repaged(picturesOfDoc(d.doc), map)),
            }));
          }),
        );
        return true;
      } catch (e) {
        push({ title: 'The pages didn’t change', body: errorMessage(e), tone: 'alert' });
        return false;
      } finally {
        pagesBusyRef.current = false;
        setPagesBusy(false);
      }
    },
    [readOnly, editor.state, ink, push, runNote, latest, doc.sheets, noteId, base, adopt],
  );

  // ── undo and redo: the text, the ink, the pages and the pictures together ──
  const applyStep = useCallback(
    (step: Step, how: 'undo' | 'redo'): void | Promise<boolean> => {
      if (step.kind === 'pages') {
        return changePagesNow(how === 'undo' ? undoOf(step.change) : step.change).then((ok) => {
          if (ok && how === 'undo' && step.restore) {
            ink.setSheet(PAPER_BASE + step.change.page, step.restore.strokes);
            writePictures(step.restore.pictures);
          }
          return ok;
        });
      }
      if (step.kind === 'page') {
        for (const c of step.ink) ink.setSheet(c.sheet, how === 'undo' ? c.before : c.after);
        if (step.paper) change({ sheets: how === 'undo' ? step.paper.before : step.paper.after });
      }
      if (step.pictures) writePictures(how === 'undo' ? step.pictures.before : step.pictures.after);
    },
    [changePagesNow, ink, change, writePictures],
  );
  const history = useTimeline(textEditor, applyStep);
  useEffect(() => {
    timelineRef.current = { undo: history.undo, redo: history.redo };
  }, [history.undo, history.redo]);
  const onInk = useCallback(
    (step: Step) => {
      if (step.kind !== 'page') return;
      history.record(step);
      for (const c of step.ink) ink.setSheet(c.sheet, c.after);
      if (step.paper) change({ sheets: step.paper.after });
      if (step.pictures) writePictures(step.pictures.after);
    },
    [history, ink, change, writePictures],
  );
  const latestDoc = useCallback(() => latest()?.doc ?? null, [latest]);
  const free = useFreePictures({
    doc: doc.doc,
    latest: latestDoc,
    write: writePictures,
    record: history.record,
    joinText: history.withPictures,
    text: textEditor,
    readOnly,
  });

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
      if (!fresh || d.title.trim() || textHeight > LINE + 1) return false;
      if ((textEditor && !textEditor.isEmpty) || picturesOfDoc(d.doc).length) return false;
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
        void deleteNote(noteId)
          .then(() => discardNote(qc, noteId))
          .catch(() => undefined);
      }, 0);
    };
  }, [noteId, discard, qc]);

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
  const layout = useMemo(() => layoutSheets(sheets), [sheets]);
  const paperless = doc.sheets === 0;

  // ── pictures and files added: dropped or pasted pictures land free, the others go in the text ──
  /** The spot on the pages under a point on screen (the nearest sheet, the nearest point on it). */
  const spotAt = useCallback(
    (clientX: number, clientY: number): Spot | null => {
      const stack = scrollerRef.current?.querySelector<HTMLElement>('.nb-stack');
      if (!stack) return null;
      const r = stack.getBoundingClientRect();
      const uy = (clientY - r.top) / zoom.zoom;
      const s = sheetAt(layout, uy);
      if (!s) return null;
      const x = Math.min(SHEET_WIDTH, Math.max(0, (clientX - r.left) / zoom.zoom));
      return { sheet: s.index, height: s.height, x, y: Math.min(s.height, Math.max(0, uy - s.top)) };
    },
    [layout, zoom.zoom],
  );
  /** The middle of what is on screen, where pasted pictures land. */
  const middleSpot = useCallback((): Spot | null => {
    const box = scrollerRef.current?.getBoundingClientRect();
    return box ? spotAt(box.left + box.width / 2, box.top + box.height / 2) : null;
  }, [spotAt]);
  /** The place in the text nearest a point on screen (null while the text isn't on screen). */
  const textPosAt = useCallback(
    (clientX: number, clientY: number): number | null => {
      const el = scrollerRef.current?.querySelector<HTMLElement>('.nb-text');
      if (!textEditor || !el) return null;
      const r = el.getBoundingClientRect();
      const left = Math.min(r.right - 2, Math.max(r.left + 2, clientX));
      const top = Math.min(r.bottom - 2, Math.max(r.top + 2, clientY));
      return textEditor.view.posAtCoords({ left, top })?.pos ?? null;
    },
    [textEditor],
  );

  const place = useCallback(
    (done: Uploaded, where: Where, k: number) => {
      const ed = textEditor;
      if (!ed) return;
      const picture = done.picture;
      if (picture && (where.free || paperless)) {
        const spot = where.free ?? middleSpot();
        if (!spot) return;
        const at = { x: spot.x + k * FAN, y: spot.y + k * FAN };
        free.add([placedPicture({ upload: done.upload, ...picture }, spot.sheet, at, spot.height)]);
        return;
      }
      const at = where.at !== null && where.at <= ed.state.doc.content.size ? where.at : null;
      if (picture) {
        const ratio = Math.min(20, Math.max(0.05, picture.width / Math.max(1, picture.height)));
        const width = startWidth(picture.width, TEXT_WIDTH);
        ed.chain().focus().insertNotePicture({ upload: done.upload, alt: picture.alt, ratio, width }, at).run();
      } else {
        ed.chain().focus().insertNoteFile({ upload: done.upload, name: done.name, size: done.size }, at).run();
      }
    },
    [textEditor, paperless, middleSpot, free],
  );

  const addFiles = useCallback(
    (files: readonly File[], where: Where) => {
      if (readOnly || !textEditor) return;
      const onPages = picturesOfDoc(latestDoc() ?? doc.doc).length;
      let room = MAX_PICTURES - inlinePictureCount(textEditor.state.doc) - onPages - uploads.pending.length;
      const going: File[] = [];
      let tooMany = false;
      let noPaper = false;
      for (const f of files) {
        if (isPicture(f)) {
          if (room > 0) {
            going.push(f);
            room -= 1;
          } else tooMany = true;
        } else if (paperless) noPaper = true;
        else going.push(f);
      }
      if (tooMany)
        push({
          title: `A note holds up to ${MAX_PICTURES} pictures`,
          body: 'Put the others in another note.',
          tone: 'alert',
        });
      if (noPaper)
        push({ title: 'Add a page first', body: 'Files go in the typed text, on a page of paper.', tone: 'alert' });
      let k = 0;
      void uploads.add(going, (done) => place(done, where, done.picture ? k++ : 0));
    },
    [readOnly, textEditor, latestDoc, doc.doc, uploads, paperless, push, place],
  );
  useEffect(() => {
    filesRef.current = (files, drop) =>
      addFiles(files, drop ? { free: spotAt(drop.x, drop.y), at: drop.at } : { free: middleSpot(), at: null });
  }, [addFiles, spotAt, middleSpot]);

  // Pasted while the text isn't being typed in (a picture picked, the pen in hand, a note on a PDF): at the middle of
  // what is on screen. (The text and the title take their own pastes.)
  useEffect(() => {
    if (readOnly) return undefined;
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      addFiles(files, { free: middleSpot(), at: null });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [readOnly, addFiles, middleSpot]);

  // Files dragged over the notebook never open in the tab; dropped on the pages, they are added there (the text takes
  // the ones dropped on it: useNoteText).
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = readOnly ? 'none' : 'copy';
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    const taken = e.nativeEvent.defaultPrevented;
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    if (taken || !files.length || !(e.target instanceof Node) || !scrollerRef.current?.contains(e.target)) return;
    addFiles(files, { free: spotAt(e.clientX, e.clientY), at: textPosAt(e.clientX, e.clientY) });
  };

  // ── pictures between the text and the page ──
  const inlineOff = paperless ? 'Add a page first: pictures in line go in the typed text, on paper.' : null;
  const space = useMemo<PictureSpace>(
    () => ({
      makeFree: (pos, attrs, shown) => {
        const stack = scrollerRef.current?.querySelector<HTMLElement>('.nb-stack');
        if (!stack) return;
        const r = stack.getBoundingClientRect();
        const z = zoom.zoom;
        const box = {
          x: (shown.left - r.left) / z,
          y: (shown.top - r.top) / z,
          w: shown.width / z,
          h: shown.height / z,
        };
        const s = sheetAt(layout, box.y + box.h / 2);
        if (!s) return;
        const picture = settle(freeFromInline(attrs, s.index, { ...box, y: box.y - s.top }), s.height);
        free.makeFree(pos, picture);
        requestAnimationFrame(() =>
          scrollerRef.current
            ?.querySelector<HTMLElement>(`[data-picture="${picture.id}"]`)
            ?.focus({ preventScroll: true }),
        );
      },
    }),
    [layout, zoom.zoom, free],
  );
  const onInline = useCallback(
    (p: FreePicture, top: number) => {
      const ed = textEditor;
      if (!ed || paperless) return;
      const drop = dropTarget(
        blockBoxes(ed.state, (at) => ed.view.nodeDOM(at)),
        top,
        LINE * zoom.zoom,
      );
      free.makeInline(p.id, drop);
      ed.commands.focus(undefined, { scrollIntoView: false });
    },
    [textEditor, paperless, zoom.zoom, free],
  );
  const onPictureLeave = useCallback(() => {
    if (!paperless) textEditor?.commands.focus(undefined, { scrollIntoView: false });
  }, [textEditor, paperless]);
  // the pages the typed text is on (none while there is none)
  const typedPages = textEditor && !textEditor.isEmpty ? textSheets(textHeight) : 0;

  const onPage = useCallback(
    (action: PageAction) => {
      const scrollTo = (sheet: number) => {
        const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-sheet="${sheet}"]`);
        el?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      };
      if (action.kind === 'go') {
        scrollTo(action.sheet);
        return;
      }
      const count = latest()?.sheets ?? doc.sheets;
      const pages = (move: PageMove, restore?: Extract<Step, { kind: 'pages' }>['restore'], show?: number) =>
        void changePagesNow(move).then((ok) => {
          if (!ok) return;
          history.record({ kind: 'pages', change: move, restore });
          if (show !== undefined) requestAnimationFrame(() => scrollTo(PAPER_BASE + show));
        });
      if (action.kind === 'add') {
        pages({ action: 'insert', page: count }, undefined, count);
        return;
      }
      const at = action.sheet - PAPER_BASE;
      if (action.kind === 'clear') {
        const before = ink.strokesOf(action.sheet);
        if (before.length) onInk({ kind: 'page', ink: [{ sheet: action.sheet, before, after: [] }] });
      } else if (action.kind === 'delete') {
        pages({ action: 'delete', page: at }, { strokes: ink.strokesOf(action.sheet), pictures: free.list });
      } else if (action.kind === 'move') {
        const to = at + action.by;
        if (to >= 0 && to < count) pages({ action: 'move', page: at, to }, undefined, to);
      }
    },
    [latest, doc.sheets, changePagesNow, history, ink, onInk, free.list],
  );

  // ── print: the pages laid out for paper, then the browser's print (Save as PDF) ──
  const onPrinted = useCallback(() => setPrinting(false), []);

  const onPdf = !!editor.note?.pdf;
  const pdfLoading = onPdf && pdf.state.status === 'loading';

  return (
    <div className={cx('nb', full && 'nb--full')} data-hub="notebook-workspace" onDragOver={onDragOver} onDrop={onDrop}>
      <input
        type="file"
        ref={fileInputRef}
        hidden
        multiple
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) addFiles(files, { free: null, at: null });
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
        onLoaded={history.clear}
      />

      <div className="nb-body">
        {pagesShown ? (
          <PagesDrawer
            sheets={sheets}
            pdf={pdf.state.status === 'ready' ? pdf.state.pdf : null}
            paper={doc.paper}
            strokesOf={ink.strokesOf}
            revision={ink.revision}
            pictures={free.list}
            typedPages={typedPages}
            readOnly={readOnly || inkReadOnly || pagesBusy}
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
            text={
              textEditor ? (
                <PictureSpaceContext.Provider value={space}>
                  <EditorContent editor={textEditor} />
                </PictureSpaceContext.Provider>
              ) : null
            }
            onPaperPress={onPaperPress}
            footer={
              readOnly ? null : (
                <Button variant="secondary" onClick={() => onPage({ kind: 'add' })} data-hub="add-page">
                  Add a page
                </Button>
              )
            }
            readOnly={inkReadOnly || pagesBusy}
            scroller={scroller}
            onTextHeight={onTextHeight}
            pictures={
              textEditor
                ? {
                    free,
                    active: tool === 'type' && !readOnly && !pagesBusy,
                    keepShape,
                    onKeepShape: setKeepShape,
                    inlineOff,
                    onInline,
                    onLeave: onPictureLeave,
                  }
                : null
            }
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
          pictures={free.list}
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
        error={remove.error ? errorMessage(remove.error) : null}
        onConfirm={() =>
          remove.mutate(noteId, {
            // the copy on this device goes once the server has deleted the note, not before
            onSuccess: () => {
              editor.discard();
              navigate('/notes', { replace: true });
            },
          })
        }
        onClose={() => setConfirming(false)}
      />
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
      {noteId && NOTE_ID.test(noteId) ? (
        <NoteWorkspace key={noteId} noteId={noteId} readOnly={readOnly} fresh={fresh} />
      ) : (
        <MissingNote />
      )}
    </Gate>
  );
}
