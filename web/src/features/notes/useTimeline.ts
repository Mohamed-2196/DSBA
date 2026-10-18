// The note's undo and redo (timeline.ts) wired to the text editor and the pages: a page step is put back by `apply`
// (sheet by sheet, the number of pages and the free pictures with it), a text step by the editor's own history (and
// `apply` puts back the pictures that changed with it). The editor's history is followed too, so an undo that didn't
// come from here (a tablet keyboard's undo key) keeps the timeline in step.
import { redoDepth, undoDepth } from '@tiptap/pm/history';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  back,
  did,
  emptyTimeline,
  forward,
  textMoved,
  withPictures,
  type PictureChange,
  type Step,
  type Timeline,
} from './timeline';

export interface NoteHistory {
  canUndo: boolean;
  canRedo: boolean;
  /** a page step was done (a gesture, a page moved or deleted, a picture placed) */
  record: (step: Step) => void;
  /** the text editor's last step changed the free pictures too (a picture put in line or made free) */
  withPictures: (pictures: PictureChange) => void;
  undo: () => void;
  redo: () => void;
}

/** `apply` puts a page step back the way it was ('undo') or does it again ('redo'), and a text step's pictures. */
export function useTimeline(editor: Editor | null, apply: (step: Step, how: 'undo' | 'redo') => void): NoteHistory {
  const [timeline, setTimeline] = useState<Timeline>(emptyTimeline);
  const ref = useRef(timeline);
  const own = useRef(false);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  const set = useCallback((t: Timeline) => {
    ref.current = t;
    setTimeline(t);
  }, []);

  useEffect(() => {
    if (!editor) return undefined;
    let depth = { undo: undoDepth(editor.state), redo: redoDepth(editor.state) };
    const follow = (how: 'undo' | 'redo') => {
      const r = textMoved(ref.current, how);
      set(r.timeline);
      if (r.moved?.pictures) applyRef.current(r.moved, how);
    };
    const onTransaction = () => {
      const now = { undo: undoDepth(editor.state), redo: redoDepth(editor.state) };
      const was = depth;
      depth = now;
      if (own.current || (now.undo === was.undo && now.redo === was.redo)) return;
      if (now.undo === was.undo - 1 && now.redo === was.redo + 1) follow('undo');
      else if (now.undo === was.undo + 1 && now.redo === was.redo - 1) follow('redo');
      else if (now.undo > was.undo) set(textMoved(ref.current, 'new').timeline);
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
    };
  }, [editor, set]);

  const runText = useCallback(
    (how: 'undo' | 'redo') => {
      if (!editor) return;
      own.current = true;
      try {
        if (how === 'undo') editor.commands.undo();
        else editor.commands.redo();
      } finally {
        own.current = false;
      }
    },
    [editor],
  );

  const record = useCallback((step: Step) => set(did(ref.current, step)), [set]);
  const joinPictures = useCallback((pictures: PictureChange) => set(withPictures(ref.current, pictures)), [set]);
  const undo = useCallback(() => {
    const r = back(ref.current);
    if (!r) return;
    set(r.timeline);
    if (r.step.kind === 'text') runText('undo');
    if (r.step.kind === 'page' || r.step.pictures) applyRef.current(r.step, 'undo');
  }, [set, runText]);
  const redo = useCallback(() => {
    const r = forward(ref.current);
    if (!r) return;
    set(r.timeline);
    if (r.step.kind === 'text') runText('redo');
    if (r.step.kind === 'page' || r.step.pictures) applyRef.current(r.step, 'redo');
  }, [set, runText]);

  return {
    canUndo: timeline.past.length > 0,
    canRedo: timeline.future.length > 0,
    record,
    withPictures: joinPictures,
    undo,
    redo,
  };
}
