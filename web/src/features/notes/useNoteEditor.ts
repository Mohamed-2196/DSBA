// The editor's engine: the text on screen, the copy on this device, and saving to the server as the student types.
//   - Every change goes to the device's copy at once (draft.ts) and to the server SAVE_AFTER ms after typing stops.
//   - One save at a time; changes made while one runs are sent when it ends.
//   - Offline: the copy waits, and is sent when the browser is back online (and every RETRY_EVERY ms until then).
//   - Saved elsewhere since (409 note_changed, another tab): the student keeps theirs (saved over the other) or loads
//     the other.
// A new note (id null) is created by its first save; `onCreated` gets its id.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '../../api/errors';
import type { Note } from '../../api/types';
import { createNote, fetchNote, noteKeys, noteSaved, saveNote, useNote } from './api';
import { setOpenNote } from './current';
import { docOf, dropDraft, emptyDoc, isBlank, openNote, readDraft, sameDoc, writeDraft, type NoteDoc } from './draft';

export const SAVE_AFTER = 700;
const RETRY_EVERY = 15_000;

/**
 * - 'saved': the server has what is on screen;
 * - 'unsaved': changes wait to be sent (they're on this device already);
 * - 'saving': a save is on its way;
 * - 'offline': the server can't be reached: changes are on this device, and go when it's back;
 * - 'conflict': the note was saved elsewhere since: the student chooses;
 * - 'error': the server refused the save (`error` says why).
 */
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'offline' | 'conflict' | 'error';

export interface NoteEditor {
  /** null until the note is loaded (or found on this device) */
  doc: NoteDoc | null;
  id: string | null;
  state: SaveState;
  error: string | null;
  /** the note as it was saved elsewhere, while state is 'conflict' */
  theirs: Note | null;
  /** loading the note failed and there's no copy of it here */
  loadError: unknown;
  /** the note doesn't exist (deleted elsewhere) and there's no copy of it here */
  missing: boolean;
  change: (patch: Partial<NoteDoc>) => void;
  /** send now (a retry, or before leaving) */
  flush: () => void;
  keepMine: () => void;
  loadTheirs: () => void;
  /** forget the copy on this device (the note was deleted) */
  discard: () => void;
}

export function useNoteEditor(
  noteId: string | null,
  { place, readOnly, onCreated }: { place?: Partial<NoteDoc>; readOnly: boolean; onCreated: (id: string) => void },
): NoteEditor {
  const qc = useQueryClient();
  const query = useNote(noteId);
  const idRef = useRef(noteId);
  const docRef = useRef<NoteDoc | null>(null);
  const baseRef = useRef<number | null>(null);
  const savedRef = useRef<NoteDoc | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  });
  const [doc, setDoc] = useState<NoteDoc | null>(() => {
    // A new note opens at once; so does a note with a copy here (the server's answer is checked against it).
    const draft = readDraft(noteId);
    const start = noteId === null ? (draft?.doc ?? emptyDoc(place)) : (draft?.doc ?? null);
    docRef.current = start;
    baseRef.current = draft?.base ?? null;
    return start;
  });
  const [state, setStateRaw] = useState<SaveState>(() => (noteId === null && readDraft(null) ? 'unsaved' : 'saved'));
  const stateRef = useRef(state);
  const setState = (s: SaveState) => {
    stateRef.current = s;
    setStateRaw(s);
  };
  const [error, setError] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);

  const show = (next: NoteDoc) => {
    docRef.current = next;
    setDoc(next);
  };

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const sent = docRef.current;
    if (readOnly || busy.current || !sent || stateRef.current === 'conflict') return;
    const id = idRef.current;
    if (id !== null && !opened.current) return; // the server's copy isn't here yet: openNote() decides first
    if (id === null ? isBlank(sent) : sameDoc(sent, savedRef.current)) {
      if (id === null && isBlank(sent)) dropDraft(null);
      if (id !== null) dropDraft(id);
      setState('saved');
      return;
    }
    busy.current = true;
    setState('saving');
    try {
      const note = id === null ? await createNote(sent) : await saveNote(id, { ...sent, version: baseRef.current ?? 1 });
      noteSaved(qc, note);
      if (id === null) {
        dropDraft(null);
        idRef.current = note.id;
        opened.current = true;
        onCreatedRef.current(note.id);
      }
      baseRef.current = note.version;
      savedRef.current = sent; // what was sent: the server tidies the title, and sending it again changes nothing
      setError(null);
      if (sameDoc(docRef.current, sent)) {
        dropDraft(note.id);
        setState('saved');
      } else {
        if (docRef.current) writeDraft(note.id, docRef.current, note.version);
        setState('unsaved');
        timer.current = setTimeout(() => void flush(), SAVE_AFTER);
      }
    } catch (e) {
      if (isApiError(e) && e.code === 'note_changed' && id !== null) {
        try {
          setTheirs(await fetchNote(id));
          setState('conflict');
        } catch {
          setState('offline');
        }
      } else if (isApiError(e) && (e.code === 'network' || e.status >= 500)) {
        setState('offline');
      } else if (isApiError(e) && e.code === 'rate_limited') {
        setState('unsaved');
        timer.current = setTimeout(() => void flush(), (e.retryAfter ?? 5) * 1000);
      } else {
        setError(isApiError(e) ? e.message : 'Your note couldn’t be saved.');
        setState('error');
      }
    } finally {
      busy.current = false;
    }
  }, [qc, readOnly]);

  // The server's copy arrives: open the note from it and the copy here.
  useEffect(() => {
    if (opened.current || !query.data || idRef.current === null) return;
    opened.current = true;
    const opening = openNote(query.data, readDraft(idRef.current));
    savedRef.current = docOf(query.data);
    baseRef.current = opening.base;
    show(opening.doc);
    if (opening.theirs) {
      setTheirs(opening.theirs);
      setState('conflict');
    } else if (!sameDoc(opening.doc, savedRef.current)) {
      setState('unsaved');
      void flush();
    }
  }, [query.data, flush]);

  // It can't be loaded: a copy here is shown (and sent once the note loads); a deleted note's copy becomes a new note.
  useEffect(() => {
    if (opened.current || !query.error || idRef.current === null) return;
    const draft = readDraft(idRef.current);
    if (isApiError(query.error) && query.error.status === 404) {
      if (draft && !isBlank(draft.doc)) {
        dropDraft(idRef.current);
        idRef.current = null;
        baseRef.current = null;
        writeDraft(null, draft.doc, null);
        show(draft.doc);
        setState('unsaved');
        void flush();
      } else {
        setMissing(true);
      }
      return;
    }
    if (draft) setState('offline');
  }, [query.error, flush]);

  // Back online, every so often while offline, and when the tab is hidden or the editor closes: send what waits.
  useEffect(() => {
    const retry = () => {
      if (stateRef.current === 'offline' || stateRef.current === 'unsaved') void flush();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') retry();
    };
    const every = setInterval(() => {
      if (stateRef.current === 'offline') void flush();
    }, RETRY_EVERY);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clearInterval(every);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', hidden);
      retry();
    };
  }, [flush]);

  // What other parts of the app see as the open note (Mini Noora reads it when the student asks about it).
  useEffect(() => {
    setOpenNote(doc ? { id: idRef.current, ...doc } : null);
  }, [doc]);
  useEffect(() => () => setOpenNote(null), []);

  const change = useCallback(
    (patch: Partial<NoteDoc>) => {
      const current = docRef.current;
      if (!current || readOnly) return;
      const next = { ...current, ...patch };
      show(next);
      writeDraft(idRef.current, next, baseRef.current);
      if (stateRef.current === 'conflict') return;
      if (stateRef.current !== 'offline' && stateRef.current !== 'error') setState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER);
    },
    [flush, readOnly],
  );

  const keepMine = useCallback(() => {
    if (!theirs) return;
    baseRef.current = theirs.version;
    savedRef.current = docOf(theirs);
    setTheirs(null);
    setState('unsaved');
    void flush();
  }, [theirs, flush]);

  const loadTheirs = useCallback(() => {
    if (!theirs) return;
    baseRef.current = theirs.version;
    savedRef.current = docOf(theirs);
    show(docOf(theirs));
    dropDraft(idRef.current);
    qc.setQueryData(noteKeys.one(theirs.id), theirs);
    setTheirs(null);
    setState('saved');
  }, [theirs, qc]);

  const discard = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    dropDraft(idRef.current);
    docRef.current = null;
    setOpenNote(null);
  }, []);

  return {
    doc,
    id: idRef.current,
    state,
    error,
    theirs,
    loadError: doc ? null : query.error,
    missing,
    change,
    flush: () => void flush(),
    keepMine,
    loadTheirs,
    discard,
  };
}
