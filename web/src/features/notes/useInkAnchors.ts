// Handwriting that moves with the typed text (surface/anchors.ts), kept in step while the pages are on screen: a
// moment after the text, the ink or the pages change, the text's blocks are measured on the paper and every stroke
// goes where its anchor says (saved like any change to the ink, but never a step to undo: undoing the text brings the
// ink back by itself). Strokes go onto the next page when the text pushes them there, and a page is added for them
// when there is none.
import type { Editor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { relocate, type BlockSpan, type TextLayout } from './surface/anchors';
import { TEXT_TOP } from './surface/layout';
import { blockIds } from './text/blockIds';
import type { InkSync } from './useInkSync';

const SETTLE = 150;

/** How far `el` is below the top of `box` (one of its offset parents), unscaled; null when `box` isn't one. */
function offsetIn(el: HTMLElement, box: HTMLElement): number | null {
  let y = 0;
  let at: Element | null = el;
  while (at instanceof HTMLElement && at !== box) {
    y += at.offsetTop;
    at = at.offsetParent;
  }
  return at === box ? y : null;
}

/** The typed text's blocks where they are on the paper (units from its top). */
export function measureText(editor: Editor, box: HTMLElement): TextLayout {
  const blocks: BlockSpan[] = [];
  let end = TEXT_TOP;
  for (const { id, pos } of blockIds(editor.state.doc)) {
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) continue;
    const top = offsetIn(dom, box);
    if (top === null) continue;
    const span = { id, top: TEXT_TOP + top, bottom: TEXT_TOP + top + dom.offsetHeight };
    blocks.push(span);
    end = Math.max(end, span.bottom);
  }
  return { blocks, end };
}

export interface InkAnchorsOptions {
  editor: Editor | null;
  ink: InkSync;
  /** the note's pages of paper */
  pages: number;
  /** the typed text on the paper (null while the pages aren't on screen) */
  textBox: () => HTMLElement | null;
  /** whether the ink may move now (written in, loaded, nothing to choose, no page change under way) */
  enabled: boolean;
  /** the text's height: a change lays the paper out again */
  textHeight: number;
  /** the ink needs this many pages */
  onPages: (pages: number) => void;
}

export function useInkAnchors({ editor, ink, pages, textBox, enabled, textHeight, onPages }: InkAnchorsOptions): void {
  const live = useRef({ editor, ink, pages, textBox, enabled, onPages });
  useEffect(() => {
    live.current = { editor, ink, pages, textBox, enabled, onPages };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = useRef(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const { editor: ed, ink: sync, pages: n, textBox: boxOf, enabled: on, onPages: grow } = live.current;
      const box = boxOf();
      if (!on || !ed || ed.isDestroyed || !box || n < 1) return;
      // the text is laid out in the page's fonts: wait for them
      if (document.fonts && document.fonts.status !== 'loaded') {
        void document.fonts.ready.then(() => schedule.current());
        return;
      }
      const moved = relocate(sync.strokesOf, n, measureText(ed, box));
      for (const [sheet, strokes] of moved.sheets) sync.setSheet(sheet, strokes);
      if (moved.pages > n) grow(moved.pages);
    }, SETTLE);
  });

  useEffect(() => {
    if (enabled) schedule.current();
  }, [enabled, ink.revision, pages, textHeight]);

  useEffect(() => {
    if (!editor) return undefined;
    const go = () => schedule.current();
    editor.on('update', go);
    return () => {
      editor.off('update', go);
    };
  }, [editor]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
