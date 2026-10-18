// The note's text, paper and place: what is on screen, the copy on this device, and saving to the server as the
// student types. (Its ink saves per sheet: useInkSync.)
//   - Every change goes to the device's copy at once (draft.ts) and to the server SAVE_AFTER ms after typing stops.
//   - One save at a time; changes made while one runs are sent when it ends.
//   - Offline: the copy waits, and is sent when the browser is back online (and every RETRY_EVERY ms until then).
//   - Saved elsewhere since (409 note_changed, another tab): the student keeps theirs (saved over the other) or loads
//     the other.
//   - A change made on the server at once (a page added, deleted or moved: `run`) waits for the save under way, sends
//     what waits first, and holds the saves while it runs; the note the server answers with is then the one saved
//     (`adopt`).
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '../../api/errors';
import type { Note } from '../../api/types';
import { fetchNote, noteKeys, noteSaved, saveNote, useNote } from './api';
import { setOpenNote } from './current';
import { docOf, dropDraft, openNote, readDraft, sameDoc, writeDraft, type NoteDoc } from './draft';

export const SAVE_AFTER = 700;
export const RETRY_EVERY = 15_000;

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
  /** the note as the server last sent it (its PDF, its ink when it opened) */
  note: Note | undefined;
  state: SaveState;
  error: string | null;
  /** when the server last confirmed what is on screen */
  savedAt: number | null;
  /** the note as it was saved elsewhere, while state is 'conflict' */
  theirs: Note | null;
  /** loading the note failed and there's no copy of it here */
  loadError: unknown;
  /** the note doesn't exist (deleted elsewhere, or never was) */
  missing: boolean;
  /** a change: the parts given, or the parts worked out from the note as it is at that moment */
  change: (patch: Partial<NoteDoc> | ((current: NoteDoc) => Partial<NoteDoc>)) => void;
  /** the note as it is now, with every change made since the last render */
  latest: () => NoteDoc | null;
  /** runs `task` once what waits is saved, with the saves held until it ends */
  run: <T>(task: () => Promise<T>) => Promise<T>;
  /** the version the note on screen is written over */
  base: () => number;
  /** the server changed the note (`note`), and `patch` makes the same change here: the server's note is the saved one */
  adopt: (note: Note, patch: (current: NoteDoc) => Partial<NoteDoc>) => void;
  /** send now (a retry, or before leaving) */
  flush: () => void;
  keepMine: () => void;
  loadTheirs: () => void;
  /** forget the copy on this device (the note was deleted) */
  discard: () => void;
  /** the plain text of what is on screen, for Mini Noora (the editor reports it as it changes) */
  setPlainText: (text: string) => void;
}

export function useNoteEditor(noteId: string, { readOnly }: { readOnly: boolean }): NoteEditor {
  const qc = useQueryClient();
  const query = useNote(noteId);
  const docRef = useRef<NoteDoc | null>(null);
  const baseRef = useRef<number | null>(null);
  const savedRef = useRef<NoteDoc | null>(null);
  const busy = useRef(false);
  const held = useRef(false);
  const idleWaiters = useRef<(() => void)[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);
  const plain = useRef('');
  const [doc, setDoc] = useState<NoteDoc | null>(() => {
    // A note with a copy here opens at once (the server's answer is checked against it).
    const draft = readDraft(noteId);
    docRef.current = draft?.doc ?? null;
    baseRef.current = draft?.base ?? null;
    return docRef.current;
  });
  const [state, setStateRaw] = useState<SaveState>('saved');
  const stateRef = useRef(state);
  const setState = (s: SaveState) => {
    stateRef.current = s;
    setStateRaw(s);
  };
  const [error, setError] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<Note | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const show = (next: NoteDoc) => {
    docRef.current = next;
    setDoc(next);
  };

  const flush = useCallback(
    async (force = false): Promise<void> => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const sent = docRef.current;
      if (readOnly || busy.current || !sent || stateRef.current === 'conflict' || !opened.current) return;
      if (held.current && !force) return; // a change on the server is under way: its end sends what waits
      if (sameDoc(sent, savedRef.current)) {
        dropDraft(noteId);
        setState('saved');
        return;
      }
      busy.current = true;
      setState('saving');
      try {
        const note = await saveNote(noteId, { ...sent, version: baseRef.current ?? 1 });
        noteSaved(qc, note);
        baseRef.current = note.version;
        savedRef.current = sent; // what was sent: the server tidies the title, and sending it again changes nothing
        setError(null);
        setSavedAt(Date.now());
        if (sameDoc(docRef.current, sent)) {
          dropDraft(noteId);
          setState('saved');
        } else {
          if (docRef.current) writeDraft(noteId, docRef.current, note.version);
          setState('unsaved');
          timer.current = setTimeout(() => void flush(), SAVE_AFTER);
        }
      } catch (e) {
        if (isApiError(e) && e.code === 'note_changed') {
          try {
            const theirs = await fetchNote(noteId);
            if (sameDoc(docOf(theirs), sent)) {
              // the server has what was sent (a save whose answer was lost): it is this tab's own
              baseRef.current = theirs.version;
              savedRef.current = sent;
              noteSaved(qc, theirs);
              setState('unsaved');
              timer.current = setTimeout(() => void flush(), SAVE_AFTER);
            } else {
              setTheirs(theirs);
              setState('conflict');
            }
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
        const waiting = idleWaiters.current;
        idleWaiters.current = [];
        for (const go of waiting) go();
      }
    },
    [qc, readOnly, noteId],
  );

  /** Resolves once no save is under way. */
  const idle = useCallback(
    (): Promise<void> => (busy.current ? new Promise<void>((go) => idleWaiters.current.push(go)) : Promise.resolve()),
    [],
  );

  const run = useCallback(
    async <T>(task: () => Promise<T>): Promise<T> => {
      held.current = true;
      try {
        await idle();
        if (!sameDoc(docRef.current, savedRef.current)) await flush(true);
        await idle();
        return await task();
      } finally {
        held.current = false;
        if (!sameDoc(docRef.current, savedRef.current)) void flush();
      }
    },
    [flush, idle],
  );

  const base = useCallback(() => baseRef.current ?? 1, []);

  // The server's copy arrives: open the note from it and the copy here.
  useEffect(() => {
    if (opened.current || !query.data) return;
    opened.current = true;
    const opening = openNote(query.data, readDraft(noteId));
    savedRef.current = docOf(query.data);
    baseRef.current = opening.base;
    plain.current = query.data.text;
    show(opening.doc);
    if (opening.theirs) {
      setTheirs(opening.theirs);
      setState('conflict');
    } else if (!sameDoc(opening.doc, savedRef.current)) {
      setState('unsaved');
      void flush();
    } else {
      dropDraft(noteId); // a copy here that says what the server says is no longer waiting
      setSavedAt(Date.parse(query.data.updatedAt));
    }
  }, [query.data, flush, noteId]);

  // It can't be loaded: a copy here is shown (and sent once the note loads).
  useEffect(() => {
    if (opened.current || !query.error) return;
    if (isApiError(query.error) && query.error.status === 404) {
      dropDraft(noteId);
      docRef.current = null;
      setDoc(null);
      return;
    }
    if (readDraft(noteId)) setState('offline');
  }, [query.error, noteId]);

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

  const publish = useCallback(() => {
    const d = docRef.current;
    const module = query.data?.moduleId ?? null;
    setOpenNote(d ? { id: noteId, title: d.title, body: plain.current, moduleId: module, lessonId: d.lessonId } : null);
  }, [noteId, query.data?.moduleId]);

  // What other parts of the app see as the open note (Mini Noora reads it when the student asks about it).
  useEffect(() => publish(), [doc, publish]);
  useEffect(() => () => setOpenNote(null), []);

  const setPlainText = useCallback(
    (text: string) => {
      if (text === plain.current) return;
      plain.current = text;
      publish();
    },
    [publish],
  );

  const change = useCallback(
    (patch: Partial<NoteDoc> | ((current: NoteDoc) => Partial<NoteDoc>)) => {
      const current = docRef.current;
      if (!current || readOnly) return;
      const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
      if (sameDoc(next, current)) return;
      show(next);
      writeDraft(noteId, next, baseRef.current ?? 1);
      if (stateRef.current === 'conflict') return;
      if (stateRef.current !== 'offline' && stateRef.current !== 'error') setState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER);
    },
    [flush, readOnly, noteId],
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
    dropDraft(noteId);
    qc.setQueryData(noteKeys.one(theirs.id), theirs);
    setTheirs(null);
    setState('saved');
    setSavedAt(Date.parse(theirs.updatedAt));
  }, [theirs, qc, noteId]);

  const latest = useCallback(() => docRef.current, []);

  const adopt = useCallback(
    (note: Note, patch: (current: NoteDoc) => Partial<NoteDoc>) => {
      const current = docRef.current;
      if (!current) return;
      const next = { ...current, ...patch(current) };
      baseRef.current = note.version;
      savedRef.current = docOf(note);
      noteSaved(qc, note);
      show(next);
      setSavedAt(Date.now());
      if (sameDoc(next, savedRef.current)) {
        dropDraft(noteId);
        setState('saved');
      } else {
        writeDraft(noteId, next, note.version);
        setState('unsaved');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), SAVE_AFTER);
      }
    },
    [qc, noteId, flush],
  );

  const discard = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    dropDraft(noteId);
    docRef.current = null;
    setOpenNote(null);
  }, [noteId]);

  const missing = !doc && isApiError(query.error) && query.error.status === 404;
  return {
    doc,
    note: query.data,
    state,
    error,
    savedAt,
    theirs,
    loadError: doc || missing ? null : query.error,
    missing,
    change,
    latest,
    run,
    base,
    adopt,
    flush: () => void flush(),
    keepMine,
    loadTheirs,
    discard,
    setPlainText,
  };
}
