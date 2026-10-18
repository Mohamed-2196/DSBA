// The note's undo and redo (timeline.ts) wired to the text editor and the ink: an ink step is put back sheet by sheet
// (and the number of pages with it), a text step by the editor's own history. The editor's history is followed too,
// so an undo that didn't come from here (a tablet keyboard's undo key) keeps the timeline in step.
import { redoDepth, undoDepth } from '@tiptap/pm/history';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { back, did, emptyTimeline, forward, textMoved, type Step, type Timeline } from './timeline';

export interface NoteHistory {
  canUndo: boolean;
  canRedo: boolean;
  /** an ink step was done (a gesture, a page moved or deleted) */
  record: (step: Step) => void;
  undo: () => void;
  redo: () => void;
}

/** `apply` puts an ink step's sheets (and pages) back the way they were ('undo') or done again ('redo'). */
export function useTimeline(editor: Editor | null, apply: (step: Extract<Step, { kind: 'ink' }>, how: 'undo' | 'redo') => void): NoteHistory {
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
    const onTransaction = () => {
      const now = { undo: undoDepth(editor.state), redo: redoDepth(editor.state) };
      const was = depth;
      depth = now;
      if (own.current || (now.undo === was.undo && now.redo === was.redo)) return;
      if (now.undo === was.undo - 1 && now.redo === was.redo + 1) set(textMoved(ref.current, 'undo'));
      else if (now.undo === was.undo + 1 && now.redo === was.redo - 1) set(textMoved(ref.current, 'redo'));
      else if (now.undo > was.undo) set(textMoved(ref.current, 'new'));
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
  const undo = useCallback(() => {
    const r = back(ref.current);
    if (!r) return;
    set(r.timeline);
    if (r.step.kind === 'text') runText('undo');
    else applyRef.current(r.step, 'undo');
  }, [set, runText]);
  const redo = useCallback(() => {
    const r = forward(ref.current);
    if (!r) return;
    set(r.timeline);
    if (r.step.kind === 'text') runText('redo');
    else applyRef.current(r.step, 'redo');
  }, [set, runText]);

  return { canUndo: timeline.past.length > 0, canRedo: timeline.future.length > 0, record, undo, redo };
}
