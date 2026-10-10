import { useEffect, useMemo, useRef } from 'react';

const SLOP = 6; // how far (px) a press must travel before it counts as a drag
const CLICK_GUARD = 350; // the click that follows a drag arrives within this many ms and is not a real click

/**
 * Pick something up with the pointer and carry it: mouse, touch and pen, through Pointer Events.
 * A press only becomes a drag once it has moved a few pixels, so a plain click stays a click.
 * Put `handlers` on the element (and give it `touch-action: none`).
 *
 * @param {boolean} enabled          false: presses are still reported, but nothing can be carried
 * @param {() => {x, y}} getPoint    where the thing is when it is pressed (its top-left corner)
 * @param onPress()                  the pointer went down on it
 * @param onStart({ dx, dy })        the press became a drag, heading this way
 * @param onMove({ x, y, vx, vy })   once per frame at most: its new top-left, and the pointer's speed in px/s
 * @param onEnd({ dragged })         the pointer let go; dragged says whether it was carried
 * @returns {{ handlers: object, followsDrag: (clickEvent) => boolean }}
 */
export function useDrag({ enabled = true, getPoint, onPress, onStart, onMove, onEnd }) {
  // The latest callbacks, so the handlers below never go stale and never change identity.
  const latest = useRef({});
  useEffect(() => {
    latest.current = { enabled, getPoint, onPress, onStart, onMove, onEnd };
  });
  const press = useRef(null); // the pointer that is down, if any
  const droppedAt = useRef(-Infinity);
  // Gone mid-drag: do not report a move to a component that is no longer there.
  useEffect(
    () => () => {
      if (press.current && press.current.frame) cancelAnimationFrame(press.current.frame);
      press.current = null;
    },
    [],
  );

  return useMemo(() => {
    const report = () => {
      const p = press.current;
      if (!p) return;
      p.frame = 0;
      latest.current.onMove?.({ x: p.x - p.grabX, y: p.y - p.grabY, vx: p.vx, vy: p.vy });
    };

    const finish = (e) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      press.current = null;
      if (p.frame) cancelAnimationFrame(p.frame);
      if (p.dragging) {
        // The last move may still be waiting for its frame: deliver it, so the drop is where the pointer is.
        latest.current.onMove?.({ x: p.x - p.grabX, y: p.y - p.grabY, vx: p.vx, vy: p.vy });
        droppedAt.current = e.timeStamp;
      }
      latest.current.onEnd?.({ dragged: p.dragging });
    };

    return {
      /** True for the click a browser sends right after a drag (the pointer went down and up on the same element). */
      followsDrag: (clickEvent) => clickEvent.timeStamp - droppedAt.current < CLICK_GUARD,
      handlers: {
        onPointerDown(e) {
          if (press.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
          const at = latest.current.getPoint();
          press.current = {
            id: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            grabX: e.clientX - at.x,
            grabY: e.clientY - at.y,
            x: e.clientX,
            y: e.clientY,
            t: e.timeStamp,
            vx: 0,
            vy: 0,
            dragging: false,
            frame: 0,
          };
          // Keep receiving this pointer's moves when it leaves the element (she is small and the hand is fast).
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* the pointer is already gone */
          }
          latest.current.onPress?.();
        },
        onPointerMove(e) {
          const p = press.current;
          if (!p || e.pointerId !== p.id) return;
          if (!p.dragging) {
            const dx = e.clientX - p.startX;
            const dy = e.clientY - p.startY;
            if (!latest.current.enabled || Math.hypot(dx, dy) < SLOP) return;
            p.dragging = true;
            latest.current.onStart?.({ dx, dy });
          }
          // Speed, smoothed a little so one jittery sample does not turn her round.
          const dt = Math.max(1, e.timeStamp - p.t);
          p.vx += (((e.clientX - p.x) / dt) * 1000 - p.vx) * 0.4;
          p.vy += (((e.clientY - p.y) / dt) * 1000 - p.vy) * 0.4;
          p.x = e.clientX;
          p.y = e.clientY;
          p.t = e.timeStamp;
          if (!p.frame) p.frame = requestAnimationFrame(report);
        },
        onPointerUp: finish,
        onPointerCancel: finish,
        onLostPointerCapture: finish,
      },
    };
  }, []);
}
