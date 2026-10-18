// What a note holds, and the unsent copy kept on this device. The editor writes the copy as the student types or
// draws and removes it once the server has the same, so a dropped connection or a closed tab loses nothing: the
// copy is sent the next time the note is opened. Keys start with 'hub.mine.', so signing out removes them (shared
// computers).
import type { InkSheet, Note, Stroke } from '../../api/types';
import { removeStored } from '../../state';
import { bindStored, readStored } from '../../state/storedValue';

/** A ProseMirror document as the text editor keeps it. */
export type RichDoc = Note['doc'];
export type Paper = Note['paper'];

/** The parts of a note the student writes (its ink is kept per sheet: InkDraft). */
export interface NoteDoc {
  title: string;
  doc: RichDoc;
  paper: Paper;
  sheets: number;
  lessonId: string | null;
  notebookId: string;
}

/** The unsent copy of a note's text: what it says, and the version of the note it was written over. */
export interface Draft {
  doc: NoteDoc;
  base: number;
  at: number;
}

/** The unsent ink of a note, by sheet: the strokes, and the version of the sheet they were drawn over. */
export type InkDraft = Record<string, { strokes: Stroke[]; base: number }>;

export const DRAFT_PREFIX = 'hub.mine.notes.';
const INK_PREFIX = `${DRAFT_PREFIX}ink.`;

export const draftKey = (id: string): string => `${DRAFT_PREFIX}${id}`;
export const inkDraftKey = (id: string): string => `${INK_PREFIX}${id}`;

export const EMPTY_DOC: RichDoc = { type: 'doc', content: [] };

/** A document of plain paragraphs, one per line (a quick note typed on a lesson page). */
export function docFromText(text: string): RichDoc {
  return {
    type: 'doc',
    content: text
      .split('\n')
      .map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
  };
}

export const docOf = (note: Note): NoteDoc => ({
  title: note.title,
  doc: note.doc,
  paper: note.paper,
  sheets: note.sheets,
  lessonId: note.lessonId,
  notebookId: note.notebookId,
});

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** JSON with every object's keys in order: the database keeps a document's keys in an order of its own, so two
 *  documents that say the same thing are the same text this way. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    isRecord(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

/** Whether two values say the same, whatever the order of their keys. */
export const sameJson = (a: unknown, b: unknown): boolean => a === b || stableJson(a) === stableJson(b);

export const sameDoc = (a: NoteDoc | null | undefined, b: NoteDoc | null | undefined): boolean =>
  !!a &&
  !!b &&
  a.title === b.title &&
  a.paper === b.paper &&
  a.sheets === b.sheets &&
  a.lessonId === b.lessonId &&
  a.notebookId === b.notebookId &&
  sameJson(a.doc, b.doc);

const PAPERS: readonly Paper[] = ['blank', 'lined', 'grid', 'dotted'];

/** A stored draft, or null when there is none or it isn't one (storage edited by hand, an older shape). */
export function asDraft(value: unknown): Draft | null {
  if (!isRecord(value)) return null;
  const { doc, base, at } = value;
  if (!isRecord(doc) || typeof base !== 'number' || !Number.isInteger(base) || typeof at !== 'number') return null;
  const { title, paper, sheets, lessonId, notebookId } = doc;
  if (typeof title !== 'string' || !isRecord(doc.doc) || doc.doc.type !== 'doc') return null;
  if (!PAPERS.includes(paper as Paper) || typeof sheets !== 'number' || typeof notebookId !== 'string') return null;
  if (!(lessonId === null || typeof lessonId === 'string')) return null;
  return { doc: { title, doc: doc.doc as RichDoc, paper: paper as Paper, sheets, lessonId, notebookId }, base, at };
}

export const readDraft = (id: string): Draft | null => asDraft(readStored<unknown>(draftKey(id), () => null));

export function writeDraft(id: string, doc: NoteDoc, base: number): void {
  bindStored<Draft | null>(draftKey(id), () => null, 'notes').set({ doc, base, at: Date.now() });
}

export const dropDraft = (id: string): void => removeStored(draftKey(id));

/** The ink waiting to be sent for a note, by sheet. */
export function readInkDraft(id: string): InkDraft {
  const value = readStored<unknown>(inkDraftKey(id), () => null);
  if (!isRecord(value)) return {};
  const out: InkDraft = {};
  for (const [sheet, entry] of Object.entries(value)) {
    if (!/^\d+$/.test(sheet) || !isRecord(entry) || !Array.isArray(entry.strokes) || typeof entry.base !== 'number')
      continue;
    out[sheet] = { strokes: entry.strokes as Stroke[], base: entry.base };
  }
  return out;
}

export function writeInkDraft(id: string, draft: InkDraft): void {
  if (!Object.keys(draft).length) {
    removeStored(inkDraftKey(id));
    return;
  }
  bindStored<InkDraft | null>(inkDraftKey(id), () => null, 'notes').set(draft);
}

/** The ids of the notes with an unsent copy on this device. */
export function draftIds(): string[] {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(INK_PREFIX)) ids.add(key.slice(INK_PREFIX.length));
      else if (key?.startsWith(DRAFT_PREFIX)) ids.add(key.slice(DRAFT_PREFIX.length));
    }
  } catch {
    /* storage unavailable: nothing was kept */
  }
  return [...ids];
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
 * - a copy written over an older version, saying something else: the copy, and the server's note to choose from;
 * - a copy that says what the server's note says: the server's note.
 */
export function openNote(server: Note, draft: Draft | null): Opening {
  const saved = docOf(server);
  if (!draft || sameDoc(draft.doc, saved)) return { doc: saved, base: server.version, theirs: null };
  if (draft.base === server.version) return { doc: draft.doc, base: server.version, theirs: null };
  return { doc: draft.doc, base: draft.base, theirs: server };
}

/** The ink to open a note with: the server's sheets, with the copy here on top where it was drawn over the same
 *  version (to be sent), and the sheets saved elsewhere since (a choice to make). */
export function openInk(
  server: readonly InkSheet[],
  draft: InkDraft,
): { sheets: Map<number, InkSheet>; pending: Set<number>; changed: Set<number> } {
  const sheets = new Map<number, InkSheet>(server.map((s) => [s.sheet, s]));
  const pending = new Set<number>();
  const changed = new Set<number>();
  for (const [key, mine] of Object.entries(draft)) {
    const n = Number(key);
    const theirs = sheets.get(n);
    const version = theirs?.version ?? 0;
    if (theirs && sameJson(theirs.strokes, mine.strokes)) continue;
    if (mine.base !== version) changed.add(n);
    sheets.set(n, { sheet: n, strokes: mine.strokes, version: mine.base });
    pending.add(n);
  }
  return { sheets, pending, changed };
}

/** What a note is called in lists: its title, else its first line, else "Untitled note". */
export function noteLabel(note: { title: string; text?: string; excerpt?: string }): string {
  const title = note.title.trim();
  if (title) return title;
  const first = (note.text ?? note.excerpt ?? '')
    .split('\n')
    .map((l) => l.replace(/^\[[ x]\]\s*/, '').trim())
    .find(Boolean);
  if (!first) return 'Untitled note';
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

/** A lesson, as the notes name it: 'Chapter 2, video 1', or 'A lesson' while (or when) it isn't in the module. */
export function lessonLabel(place: { c: number; v: number } | null): string {
  return place ? `Chapter ${place.c + 1}, video ${place.v + 1}` : 'A lesson';
}

/** The start of a note's text as one plain line, for lists. */
export function plainExcerpt(text: string, max = 160): string {
  const plain = text
    .replace(/\$\$?([^$]*)\$\$?/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
