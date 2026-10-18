// Dragging a picture or a file to another place in the note, with a mouse, a finger or a pen: the block follows the
// pointer, a line shows where it will land (between two blocks, or lower down the page below the text), and it moves
// there when it is let go. The page scrolls when the pointer nears the edge of the view.
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LINE } from '../surface/layout';
import { blockBoxes, dropTarget, moveBlock, staysPut, type Drop } from './blocks';

/** How far (pixels) the pointer goes before a press becomes a drag. */
const THRESHOLD = 6;
/** Pixels from the top or bottom of the view where the page scrolls by itself, and how fast. */
const EDGE = 48;
const SCROLL_STEP = 14;

export interface MoveState {
  /** how far the block has been dragged, in page units */
  dx: number;
  dy: number;
  /** where it lands, on screen (pixels) */
  line: { left: number; top: number; width: number } | null;
}

interface Options {
  editor: Editor;
  getPos: () => number | undefined;
  /** whether the block can be moved at all (an editable note, not while cropping) */
  enabled: boolean;
  /** whether it is selected: a finger only moves a selected block (on any other, it scrolls the page) */
  selected: boolean;
  /** attributes the move changes on the way (a picture's place across the text), from how far it went across */
  across?: (dxUnits: number) => Record<string, unknown> | null;
}

export function useBlockMove({ editor, getPos, enabled, selected, across }: Options) {
  const [move, setMove] = useState<MoveState | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // A finger or a pen on a block that isn't selected scrolls or writes as usual; a press of the mouse selects it
      // and can drag it at once.
      if (!selected && e.pointerType !== 'mouse') return;
      const pos = getPos();
      if (pos === undefined) return;
      if (!selected) editor.chain().setNodeSelection(pos).focus(undefined, { scrollIntoView: false }).run();
      else if (!editor.isFocused) editor.commands.focus(undefined, { scrollIntoView: false });
      const el = e.currentTarget;
      const start = { x: e.clientX, y: e.clientY };
      const rect = el.getBoundingClientRect();
      const zoom = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1;
      const scroller = el.closest<HTMLElement>('.nb-scroller');
      const textEl = el.closest<HTMLElement>('.nb-text');
      let dragging = false;
      let drop: Drop | null = null;
      let changed: Record<string, unknown> | null = null;
      let scrolled = 0;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);

      const update = (clientX: number, clientY: number) => {
        const dx = (clientX - start.x) / zoom;
        const dy = (clientY - start.y + scrolled) / zoom;
        // it lands where its top edge is
        const top = rect.top + (clientY - start.y);
        drop = dropTarget(blockBoxes(editor.state, (at) => editor.view.nodeDOM(at)), top, LINE * zoom);
        changed = across ? across(dx) : null;
        const box = textEl?.getBoundingClientRect();
        setMove({ dx, dy, line: box ? { left: box.left, top: drop.at, width: box.width } : null });
      };
      const onMove = (ev: PointerEvent) => {
        if (!dragging) {
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < THRESHOLD) return;
          dragging = true;
        }
        ev.preventDefault();
        if (scroller) {
          const s = scroller.getBoundingClientRect();
          const step = ev.clientY < s.top + EDGE ? -SCROLL_STEP : ev.clientY > s.bottom - EDGE ? SCROLL_STEP : 0;
          if (step) {
            const before = scroller.scrollTop;
            scroller.scrollTop += step;
            scrolled += scroller.scrollTop - before;
          }
        }
        update(ev.clientX, ev.clientY);
      };
      const finish = (commit: boolean) => {
        cleanup.current?.();
        cleanup.current = null;
        setMove(null);
        const pos = getPos();
        if (!commit || !dragging || !drop || pos === undefined) return;
        const node = editor.state.doc.nodeAt(pos);
        if (!node) return;
        if (staysPut(pos, node.nodeSize, drop)) {
          if (changed) editor.chain().setNodeSelection(pos).updateAttributes(node.type.name, changed).run();
          return;
        }
        const tr = moveBlock(editor.state, pos, drop, changed ?? undefined);
        if (tr) editor.view.dispatch(tr);
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') finish(false);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey);
      cleanup.current = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
      };
    },
    [editor, getPos, enabled, selected, across],
  );

  return { move, onPointerDown };
}
