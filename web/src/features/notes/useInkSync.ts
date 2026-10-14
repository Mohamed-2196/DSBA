// A note's handwriting, sheet by sheet: what is on screen, the copy on this device, and saving each changed sheet
// with the version it was drawn over. It behaves like the text (useNoteEditor): saved a moment after the pen
// lifts, kept on this device while offline, and a choice when a sheet was written on elsewhere since.
import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError } from '../../api/errors';
import type { InkSheet, Note, Stroke } from '../../api/types';
import { fetchNote, saveInk } from './api';
import { openInk, readInkDraft, writeInkDraft, type InkDraft } from './draft';
import { RETRY_EVERY, type SaveState } from './useNoteEditor';

const SAVE_AFTER = 900;
const NONE: readonly Stroke[] = [];

export interface InkSync {
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

export function useInkSync(noteId: string, note: Note | undefined, { readOnly }: { readOnly: boolean }): InkSync {
  const strokes = useRef(new Map<number, readonly Stroke[]>());
  const versions = useRef(new Map<number, number>());
  const dirty = useRef(new Set<number>());
  const conflict = useRef(new Set<number>());
  const opened = useRef(false);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const keepCopy = useCallback(() => {
    const draft: InkDraft = {};
    for (const n of dirty.current) draft[n] = { strokes: [...(strokes.current.get(n) ?? NONE)], base: versions.current.get(n) ?? 0 };
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

  // The note arrives: its sheets, with the copy on this device on top.
  useEffect(() => {
    if (opened.current || !note) return;
    opened.current = true;
    const { sheets, pending, changed } = openInk(note.ink, readInkDraft(noteId));
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
    bump();
    if (pending.size) void flush();
  }, [note, noteId, flush]);

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
      if (readOnly) return;
      strokes.current.set(sheet, next);
      dirty.current.add(sheet);
      keepCopy();
      bump();
      if (conflict.current.has(sheet)) return;
      if (stateRef.current !== 'offline' && stateRef.current !== 'error' && stateRef.current !== 'conflict') setState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER);
    },
    [flush, keepCopy, readOnly],
  );

  const settle = useCallback(
    async (mine: boolean) => {
      let fresh: Note;
      try {
        fresh = await fetchNote(noteId);
      } catch {
        setState('offline');
        return;
      }
      const server = new Map(fresh.ink.map((s) => [s.sheet, s]));
      for (const n of conflict.current) {
        versions.current.set(n, server.get(n)?.version ?? 0);
        if (!mine) {
          strokes.current.set(n, server.get(n)?.strokes ?? NONE);
          dirty.current.delete(n);
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
