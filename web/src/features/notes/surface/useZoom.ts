// The page's zoom, and the scrolling that goes with it: a zoom keeps a point of the page where it is on screen (the
// point between two fingers, under the mouse, or the middle of the view), and the page fits the window's width
// until the student zooms themselves (and again when they ask, or the window changes while it still fits).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clampZoom, fitZoom } from './layout';
import type { ZoomAnchor } from './Surface';

export interface Zoom {
  zoom: number;
  /** whether the page fits the window's width (what "Fit" would do) */
  fitted: boolean;
  zoomTo: (zoom: number, anchor?: ZoomAnchor) => void;
  /** a step in or out, about the middle of the view */
  step: (direction: 1 | -1) => void;
  fit: () => void;
}

const STEPS = [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5, 3, 4];

/** `scroller` is the element the pages scroll in (null until it is on screen). */
export function useZoom(scroller: HTMLElement | null): Zoom {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const fittedRef = useRef(true);
  const [fitted, setFitted] = useState(true);
  const pending = useRef<{ unit: { x: number; y: number }; client: { x: number; y: number } } | null>(null);

  const stackRect = useCallback(() => scroller?.querySelector('.nb-stack')?.getBoundingClientRect() ?? null, [scroller]);

  const apply = useCallback(
    (next: number, anchor: ZoomAnchor | undefined, fit: boolean) => {
      const sc = scroller;
      const z0 = zoomRef.current;
      const z1 = clampZoom(next);
      fittedRef.current = fit;
      setFitted(fit);
      const rect = stackRect();
      let unit = anchor?.unit ?? null;
      let client = anchor?.client ?? null;
      if (sc && rect && !client) {
        const box = sc.getBoundingClientRect();
        client = { x: box.left + box.width / 2, y: box.top + Math.min(box.height / 2, 200) };
      }
      if (rect && client && !unit) unit = { x: (client.x - rect.left) / z0, y: (client.y - rect.top) / z0 };
      if (z1 === z0) {
        // only moving: put the anchored point under the client point now
        if (sc && rect && unit && client) {
          sc.scrollLeft += rect.left + unit.x * z0 - client.x;
          sc.scrollTop += rect.top + unit.y * z0 - client.y;
        }
        return;
      }
      pending.current = unit && client ? { unit, client } : null;
      zoomRef.current = z1;
      setZoom(z1);
    },
    [scroller, stackRect],
  );

  // After the page is laid out at the new zoom: scroll so the anchored point is back under the client point.
  useLayoutEffect(() => {
    const p = pending.current;
    pending.current = null;
    const rect = stackRect();
    if (!p || !scroller || !rect) return;
    scroller.scrollLeft += rect.left + p.unit.x * zoom - p.client.x;
    scroller.scrollTop += rect.top + p.unit.y * zoom - p.client.y;
  }, [zoom, scroller, stackRect]);

  const fit = useCallback(() => {
    if (!scroller || scroller.clientWidth < 120) return;
    apply(fitZoom(scroller.clientWidth), undefined, true);
  }, [scroller, apply]);

  // Fit at first, and again when the window changes while the page still fits it (a tablet turned on its side).
  useEffect(() => {
    if (!scroller) return undefined;
    let width = 0;
    const ro = new ResizeObserver(() => {
      if (Math.abs(scroller.clientWidth - width) < 2) return;
      width = scroller.clientWidth;
      if (fittedRef.current) fit();
    });
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller, fit]);

  const zoomTo = useCallback((next: number, anchor?: ZoomAnchor) => apply(next, anchor, false), [apply]);
  const step = useCallback(
    (direction: 1 | -1) => {
      const z = zoomRef.current;
      const next = direction > 0 ? (STEPS.find((s) => s > z + 0.001) ?? z) : ([...STEPS].reverse().find((s) => s < z - 0.001) ?? z);
      apply(next, undefined, false);
    },
    [apply],
  );

  return { zoom, fitted, zoomTo, step, fit };
}
