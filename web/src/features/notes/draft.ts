// What a note holds, and the unsent copy kept on this device. The editor writes the copy as the student types and
// removes it once the server has the same text, so a dropped connection or a closed tab loses nothing: the copy is
// sent the next time the note is opened. Keys start with 'hub.mine.', so signing out removes them (shared computers).
import type { Note } from '../../api/types';
import { removeStored } from '../../state';
import { bindStored, readStored } from '../../state/storedValue';

/** The parts of a note the student writes. */
export interface NoteDoc {
  title: string;
  body: string;
  moduleId: string | null;
  chapter: number | null;
  video: number | null;
}

/** The unsent copy of a note: what it says, and the version of the note it was written over (null: a new note). */
export interface Draft {
  doc: NoteDoc;
  base: number | null;
  at: number;
}

export const DRAFT_PREFIX = 'hub.mine.notes.';
/** The draft of a note that isn't on the server yet. */
export const NEW_NOTE = 'new';

export const draftKey = (id: string | null): string => `${DRAFT_PREFIX}${id ?? NEW_NOTE}`;

export const emptyDoc = (place: Partial<Pick<NoteDoc, 'moduleId' | 'chapter' | 'video'>> = {}): NoteDoc => ({
  title: '',
  body: '',
  moduleId: place.moduleId ?? null,
  chapter: place.moduleId != null ? (place.chapter ?? null) : null,
  video: place.moduleId != null && place.chapter != null ? (place.video ?? null) : null,
});

export const docOf = (note: Note): NoteDoc => ({ title: note.title, body: note.body, moduleId: note.moduleId, chapter: note.chapter, video: note.video });

export const sameDoc = (a: NoteDoc | null | undefined, b: NoteDoc | null | undefined): boolean =>
  !!a && !!b && a.title === b.title && a.body === b.body && a.moduleId === b.moduleId && a.chapter === b.chapter && a.video === b.video;

export const isBlank = (doc: NoteDoc): boolean => !doc.title.trim() && !doc.body.trim();

const isNum = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isInteger(v));

/** A stored draft, or null when there is none or it isn't one (storage edited by hand, an older shape). */
export function asDraft(value: unknown): Draft | null {
  if (!value || typeof value !== 'object') return null;
  const { doc, base, at } = value as Record<string, unknown>;
  if (!doc || typeof doc !== 'object' || !isNum(base) || typeof at !== 'number') return null;
  const d = doc as Record<string, unknown>;
  if (typeof d.title !== 'string' || typeof d.body !== 'string') return null;
  if (!(d.moduleId === null || typeof d.moduleId === 'string') || !isNum(d.chapter) || !isNum(d.video)) return null;
  return { doc: { title: d.title, body: d.body, moduleId: d.moduleId, chapter: d.chapter, video: d.video }, base, at };
}

export const readDraft = (id: string | null): Draft | null => asDraft(readStored<unknown>(draftKey(id), () => null));

export function writeDraft(id: string | null, doc: NoteDoc, base: number | null): void {
  bindStored<Draft | null>(draftKey(id), () => null, 'notes').set({ doc, base, at: Date.now() });
}

export const dropDraft = (id: string | null): void => removeStored(draftKey(id));

/** The ids of the notes with an unsent copy on this device (NEW_NOTE for a new one). */
export function draftIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) ids.push(key.slice(DRAFT_PREFIX.length));
    }
  } catch {
    /* storage unavailable: nothing was kept */
  }
  return ids;
}

/** Where the editor starts when it opens a note. */
export interface Opening {
  doc: NoteDoc;
  /** the version the text on screen is written over */
  base: number;
  /** the server's note, when it was saved elsewhere since the copy on this device was written over it */
  theirs: Note | null;
}

/**
 * Opens a note from the server's copy and the one on this device:
 * - no copy here: the server's note;
 * - a copy written over the server's version: the copy (the editor sends it);
 * - a copy written over an older version, with other text: the copy, and the server's note to choose from;
 * - a copy that says what the server's note says: the server's note.
 */
export function openNote(server: Note, draft: Draft | null): Opening {
  const saved = docOf(server);
  if (!draft || sameDoc(draft.doc, saved)) return { doc: saved, base: server.version, theirs: null };
  if (draft.base === server.version) return { doc: draft.doc, base: server.version, theirs: null };
  return { doc: draft.doc, base: draft.base ?? server.version, theirs: server };
}

/** What a note is called in lists: its title, else its first line, else "Untitled note". */
export function noteLabel(note: { title: string; body?: string; excerpt?: string }): string {
  const title = note.title.trim();
  if (title) return title;
  const first = (note.body ?? note.excerpt ?? '')
    .split('\n')
    .map((l) => l.replace(/^[\s#>*\-\d.)]+/, '').replace(/[*_`]/g, '').trim())
    .find(Boolean);
  if (!first) return 'Untitled note';
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

/** A lesson, as the notes name it. */
export function lessonLabel(chapter: number, video: number): string {
  return `Chapter ${chapter + 1}, video ${video + 1}`;
}

/** The start of a note's body as one plain line, for lists. */
export function plainExcerpt(text: string, max = 160): string {
  const plain = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
