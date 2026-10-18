// A note's handwriting, sheet by sheet: what is on screen, the copy on this device, and saving each changed sheet
// with the version it was drawn over. It behaves like the text (useNoteEditor): saved a moment after the pen
// lifts, kept on this device while offline, and a choice when a sheet was written on elsewhere since.
//
// The note lists the sheets that have ink; each one is read on its own (GET /notes/{id}/ink/{sheet}) when the note
// opens. Until all of them are in (`ready`), nothing can be drawn: a stroke on a sheet not read yet would replace it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '../../api/errors';
import type { InkInfo, InkSheet, Note, Stroke } from '../../api/types';
import { fetchInk, fetchNote, saveInk } from './api';
import { openInk, readInkDraft, writeInkDraft, type InkDraft } from './draft';
import { RETRY_EVERY, type SaveState } from './useNoteEditor';

const SAVE_AFTER = 900;
const NONE: readonly Stroke[] = [];
/** Sheets read at once when the note opens. */
const READ_AT_ONCE = 4;

export type InkLoad = 'loading' | 'ready' | 'failed';

export interface InkSync {
  /** whether every sheet's ink has been read (nothing can be drawn before) */
  load: InkLoad;
  /** read the sheets again after a failure */
  retryLoad: () => void;
  /** the strokes on a sheet */
  strokesOf: (sheet: number) => readonly Stroke[];
  /** bumps whenever a sheet's strokes change */
  revision: number;
  state: SaveState;
  error: string | null;
  savedAt: number | null;
  /** sheets written on elsewhere since they were drawn on here */
  conflicts: readonly number[];
  setSheet: (sheet: number, strokes: readonly Stroke[]) => void;
  flush: () => void;
  keepMine: () => void;
  loadTheirs: () => void;
}

/** The sheets' ink, a few at a time. */
async function readSheets(noteId: string, sheets: readonly InkInfo[]): Promise<InkSheet[]> {
  const out: InkSheet[] = [];
  for (let i = 0; i < sheets.length; i += READ_AT_ONCE) {
    out.push(...(await Promise.all(sheets.slice(i, i + READ_AT_ONCE).map((s) => fetchInk(noteId, s.sheet)))));
  }
  return out;
}

export function useInkSync(noteId: string, note: Note | undefined, { readOnly }: { readOnly: boolean }): InkSync {
  const strokes = useRef(new Map<number, readonly Stroke[]>());
  const versions = useRef(new Map<number, number>());
  const dirty = useRef(new Set<number>());
  const conflict = useRef(new Set<number>());
  const opened = useRef(false);
  const reading = useRef(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [load, setLoad] = useState<InkLoad>('loading');
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const [state, setStateRaw] = useState<SaveState>('saved');
  const stateRef = useRef(state);
  const setState = (s: SaveState) => {
    stateRef.current = s;
    setStateRaw(s);
  };
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<number[]>([]);
  const bump = () => setRevision((r) => r + 1);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const keepCopy = useCallback(() => {
    const draft: InkDraft = {};
    for (const n of dirty.current)
      draft[n] = { strokes: [...(strokes.current.get(n) ?? NONE)], base: versions.current.get(n) ?? 0 };
    writeInkDraft(noteId, draft);
  }, [noteId]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (readOnly || busy.current || !opened.current) return;
    const waiting = [...dirty.current].filter((n) => !conflict.current.has(n));
    if (!waiting.length) {
      if (!conflict.current.size && stateRef.current !== 'error') setState('saved');
      return;
    }
    busy.current = true;
    setState('saving');
    try {
      for (const n of waiting) {
        const sent = strokes.current.get(n) ?? NONE;
        let saved: InkSheet;
        try {
          saved = await saveInk(noteId, n, { strokes: [...sent], version: versions.current.get(n) ?? 0 });
        } catch (e) {
          if (isApiError(e) && e.code === 'ink_changed') {
            conflict.current.add(n);
            setConflicts([...conflict.current].sort((a, b) => a - b));
            continue;
          }
          throw e;
        }
        versions.current.set(n, saved.version);
        if (strokes.current.get(n) === sent) dirty.current.delete(n);
      }
      keepCopy();
      setError(null);
      setSavedAt(Date.now());
      if (conflict.current.size) setState('conflict');
      else if (dirty.current.size) {
        setState('unsaved');
        timer.current = setTimeout(() => void flush(), SAVE_AFTER);
      } else setState('saved');
    } catch (e) {
      if (isApiError(e) && (e.code === 'network' || e.status >= 500)) setState('offline');
      else if (isApiError(e) && e.code === 'rate_limited') {
        setState('unsaved');
        timer.current = setTimeout(() => void flush(), (e.retryAfter ?? 5) * 1000);
      } else {
        setError(isApiError(e) ? e.message : 'Your writing couldn’t be saved.');
        setState('error');
      }
    } finally {
      busy.current = false;
    }
  }, [noteId, readOnly, keepCopy]);

  // The note arrives: its sheets are read, then shown with the copy on this device on top.
  useEffect(() => {
    if (opened.current || reading.current || !note) return;
    reading.current = true;
    setLoad('loading');
    readSheets(noteId, note.ink)
      .then((sheetsRead) => {
        reading.current = false;
        if (!mounted.current) return;
        opened.current = true;
        const { sheets, pending, changed } = openInk(sheetsRead, readInkDraft(noteId));
        for (const [n, s] of sheets) {
          strokes.current.set(n, s.strokes);
          versions.current.set(n, s.version);
        }
        for (const n of pending) dirty.current.add(n);
        for (const n of changed) conflict.current.add(n);
        if (changed.size) {
          setConflicts([...changed].sort((a, b) => a - b));
          setState('conflict');
        }
        setLoad('ready');
        bump();
        if (pending.size) void flush();
      })
      .catch(() => {
        reading.current = false;
        if (mounted.current) setLoad('failed');
      });
  }, [note, noteId, flush, attempt]);

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

  const setSheet = useCallback(
    (sheet: number, next: readonly Stroke[]) => {
      if (readOnly || !opened.current) return;
      strokes.current.set(sheet, next);
      dirty.current.add(sheet);
      keepCopy();
      bump();
      if (conflict.current.has(sheet)) return;
      if (stateRef.current !== 'offline' && stateRef.current !== 'error' && stateRef.current !== 'conflict')
        setState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER);
    },
    [flush, keepCopy, readOnly],
  );

  const settle = useCallback(
    async (mine: boolean) => {
      const sheets = [...conflict.current];
      let server: InkSheet[];
      try {
        const fresh = await fetchNote(noteId);
        const listed = new Map(fresh.ink.map((s) => [s.sheet, s]));
        server = await readSheets(
          noteId,
          sheets.map((n) => listed.get(n) ?? { sheet: n, version: 0 }),
        );
      } catch {
        setState('offline');
        return;
      }
      for (const s of server) {
        versions.current.set(s.sheet, s.version);
        if (!mine) {
          strokes.current.set(s.sheet, s.strokes);
          dirty.current.delete(s.sheet);
        }
      }
      conflict.current.clear();
      setConflicts([]);
      keepCopy();
      bump();
      setState(dirty.current.size ? 'unsaved' : 'saved');
      if (dirty.current.size) void flush();
    },
    [noteId, keepCopy, flush],
  );

  const strokesOf = useCallback((sheet: number) => strokes.current.get(sheet) ?? NONE, []);

  return {
    load,
    retryLoad: () => setAttempt((a) => a + 1),
    strokesOf,
    revision,
    state,
    error,
    savedAt,
    conflicts,
    setSheet,
    flush: () => void flush(),
    keepMine: () => void settle(true),
    loadTheirs: () => void settle(false),
  };
}
