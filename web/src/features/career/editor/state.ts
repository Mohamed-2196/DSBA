// What every part of the Career Navigator editor shares: the draft, how to change it, the API's errors for a field,
// and which item is open.
import { createContext, useContext } from 'react';
import type { CareerDoc } from '../../../api/types';
import type { EditorSection } from './doc';

export interface EditorState {
  /** the draft being edited */
  doc: CareerDoc;
  /** the document as it was loaded (or last saved): an item not in it is new, and its id can still change */
  saved: CareerDoc;
  update: (change: (doc: CareerDoc) => CareerDoc) => void;
  /** The API's error for a field, by its path under the document: 'employers.3.why'. */
  err: (path: string) => string | undefined;
  /** The open item, as `${section}:${id}` (one at a time). */
  open: string | null;
  setOpen: (key: string | null) => void;
  /** The React key of an item's row: a saved item's id, a new one's key from when it was added. */
  rowKey: (section: EditorSection, id: string) => string;
  /** A new item was added, or its id changed: its row keeps one key, so the field being typed in keeps the focus. */
  keepRow: (section: EditorSection, id: string, from?: string) => void;
}

export const EditorContext = createContext<EditorState | null>(null);

export function useEditor(): EditorState {
  const state = useContext(EditorContext);
  if (!state) throw new Error('useEditor() must be used inside the Career Navigator editor');
  return state;
}

export const openKey = (section: EditorSection, id: string): string => `${section}:${id}`;

/** New items' row keys, by `${section}:${id}`. */
export type RowKeys = Readonly<Record<string, string>>;

let added = 0;

/**
 * The row keys after a new item was added (no `from`: it gets a key of its own, `#<n>`, which no id can be) or its id
 * changed from `from` to `id` (its key moves with it).
 */
export function keepRowKey(keys: RowKeys, section: EditorSection, id: string, from?: string): RowKeys {
  const next: Record<string, string> = { ...keys };
  let key: string;
  if (from === undefined) {
    added += 1;
    key = `#${added}`;
  } else {
    key = rowKeyOf(keys, section, from);
    delete next[openKey(section, from)];
  }
  next[openKey(section, id)] = key;
  return next;
}

export const rowKeyOf = (keys: RowKeys, section: EditorSection, id: string): string =>
  keys[openKey(section, id)] ?? openKey(section, id);
