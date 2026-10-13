// The note open in the editor right now, for other parts of the app to read (Mini Noora). The editor sets it as
// the student types and clears it when it closes. Plain data: what the student sees, never the save state.
import { useSyncExternalStore } from 'react';

export interface OpenNote {
  /** null while a new note isn't saved yet */
  id: string | null;
  title: string;
  body: string;
  moduleId: string | null;
  chapter: number | null;
  video: number | null;
}

let current: OpenNote | null = null;
const listeners = new Set<() => void>();

export function setOpenNote(note: OpenNote | null): void {
  if (note === current) return;
  current = note;
  for (const l of listeners) l();
}

function getOpenNote(): OpenNote | null {
  return current;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** The note open in the editor, kept up to date; null when none is open. */
export function useOpenNote(): OpenNote | null {
  return useSyncExternalStore(subscribe, getOpenNote, () => null);
}
