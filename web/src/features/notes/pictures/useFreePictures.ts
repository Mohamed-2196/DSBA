// The note's free pictures (in its document, beside the text: document.ts), the one picked, and every change to them.
// A change goes into the note (saved, and kept on this device, with the text) and onto the note's timeline, so undo
// and redo take it back like anything else the student did.
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RichDoc } from '../draft';
import type { Drop } from '../text/blocks';
import { picturesStep, type PictureChange, type Step } from '../timeline';
import { picturesOfDoc, putInTr, takeOutTr } from './document';
import { inlineFromFree, type FreePicture } from './geometry';

export interface FreePictures {
  list: readonly FreePicture[];
  /** whether they can be changed (an editable note) */
  editable: boolean;
  selected: FreePicture | null;
  select: (id: string | null) => void;
  /** one picture changed (moved, resized, turned, cropped, described): a step to undo */
  change: (next: FreePicture) => void;
  /** pictures added (dropped or pasted): one step, the last one picked */
  add: (pictures: readonly FreePicture[]) => void;
  remove: (id: string) => void;
  /** the order changed (one above the other): a step to undo */
  reorder: (next: readonly FreePicture[]) => void;
  /** the picture in the text at `pos` made free as `picture`, and picked: one step with the text's */
  makeFree: (pos: number, picture: FreePicture) => void;
  /** the free picture `id` put in the text where `drop` says: one step with the text's */
  makeInline: (id: string, drop: Drop) => void;
}

interface Options {
  /** the note's document, as rendered */
  doc: RichDoc;
  /** the note's document now, with the changes made since the render */
  latest: () => RichDoc | null;
  /** the free pictures set in the note's document (no step) */
  write: (next: readonly FreePicture[]) => void;
  /** a step done, for undo */
  record: (step: Step) => void;
  /** the text editor's last step changed the pictures too */
  joinText: (change: PictureChange) => void;
  /** the text editor (pictures put in line, or taken out of it) */
  text: Editor | null;
  readOnly: boolean;
}

export function useFreePictures({ doc, latest, write, record, joinText, text, readOnly }: Options): FreePictures {
  const list = picturesOfDoc(doc);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (selectedId && list.find((p) => p.id === selectedId)) || null;
  const editable = !readOnly;
  // the note goes with its editor (an upload may finish after the student left the note)
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const current = useCallback((): readonly FreePicture[] => picturesOfDoc(latest() ?? doc), [latest, doc]);
  /** The pictures changed by `next(before)`, saved and recorded as a step (when anything changed). */
  const step = useCallback(
    (next: (before: readonly FreePicture[]) => readonly FreePicture[]) => {
      if (readOnly || !alive.current) return;
      const before = current();
      const after = next(before);
      if (after === before) return;
      write(after);
      record(picturesStep(before, after));
    },
    [readOnly, current, write, record],
  );

  const change = useCallback(
    (next: FreePicture) => step((before) => before.map((p) => (p.id === next.id ? next : p))),
    [step],
  );
  const add = useCallback(
    (pictures: readonly FreePicture[]) => {
      if (!pictures.length) return;
      step((before) => [...before, ...pictures]);
      setSelectedId(pictures[pictures.length - 1].id);
    },
    [step],
  );
  const remove = useCallback(
    (id: string) => {
      step((before) => before.filter((p) => p.id !== id));
      setSelectedId((s) => (s === id ? null : s));
    },
    [step],
  );
  const reorder = useCallback((next: readonly FreePicture[]) => step(() => next), [step]);

  // In line and free: the text's change is a step of the editor's history, joined with the pictures' change.
  const makeFree = useCallback(
    (pos: number, picture: FreePicture) => {
      if (readOnly || !text || !alive.current) return;
      const tr = takeOutTr(text.state, pos);
      if (!tr) return;
      const before = current();
      text.view.dispatch(tr);
      const after = [...before, picture];
      write(after);
      joinText({ before, after });
      setSelectedId(picture.id);
    },
    [readOnly, text, current, write, joinText],
  );
  const makeInline = useCallback(
    (id: string, drop: Drop) => {
      if (readOnly || !text || !alive.current) return;
      const before = current();
      const picture = before.find((p) => p.id === id);
      const tr = picture ? putInTr(text.state, drop, inlineFromFree(picture)) : null;
      if (!tr) return;
      text.view.dispatch(tr);
      const after = before.filter((p) => p.id !== id);
      write(after);
      joinText({ before, after });
      setSelectedId(null);
    },
    [readOnly, text, current, write, joinText],
  );

  return useMemo(
    () => ({
      list,
      editable,
      selected,
      select: setSelectedId,
      change,
      add,
      remove,
      reorder,
      makeFree,
      makeInline,
    }),
    [list, editable, selected, change, add, remove, reorder, makeFree, makeInline],
  );
}
