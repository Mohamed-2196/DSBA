// The note's save state as one: its text and its handwriting save apart, and the header shows the one that needs the
// student most.
import { isApiError } from '../../api/errors';
import type { SaveState } from './useNoteEditor';

const ORDER: readonly SaveState[] = ['conflict', 'error', 'offline', 'saving', 'unsaved', 'saved'];

export function combinedState(text: SaveState, ink: SaveState): SaveState {
  return ORDER.find((s) => s === text || s === ink) ?? 'saved';
}

/** Whether sending the same again can help after a failed save: not when the server refused what was sent (a 413 or
 *  422) or the note is gone (404). */
export const canRetry = (e: unknown): boolean => !(isApiError(e) && [404, 413, 422].includes(e.status));
