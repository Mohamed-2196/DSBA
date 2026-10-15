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
}

export const EditorContext = createContext<EditorState | null>(null);

export function useEditor(): EditorState {
  const state = useContext(EditorContext);
  if (!state) throw new Error('useEditor() must be used inside the Career Navigator editor');
  return state;
}

export const openKey = (section: EditorSection, id: string): string => `${section}:${id}`;
