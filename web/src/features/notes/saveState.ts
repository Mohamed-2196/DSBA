// The note's save state as one: its text and its handwriting save apart, and the header shows the one that needs the
// student most.
import type { SaveState } from './useNoteEditor';

const ORDER: readonly SaveState[] = ['conflict', 'error', 'offline', 'saving', 'unsaved', 'saved'];

export function combinedState(text: SaveState, ink: SaveState): SaveState {
  return ORDER.find((s) => s === text || s === ink) ?? 'saved';
}
