// The writing surface: a note's sheets (its PDF's pages, then paper with the typed text), the pictures free on them,
// the ink on each, and everything the pen, the eraser, the lasso and the laser do on them.
//
// The column is laid out in sheet units and scaled for the zoom as a whole (layout.ts), so the text, the pictures and
// the ink keep their places at every zoom. Ink lies above the text and the pictures: the pen writes over them. The
// free pictures are picked and edited with the Type tool (pictures/FreePictureLayer.tsx).
//
// Input, the way notebook apps on tablets work:
//   - A stylus always writes, even while typing (it picks the pen). Once one is seen, fingers scroll and zoom
//     instead of drawing (palm rejection); without one, a finger draws with the ink tools and two fingers scroll.
//   - Two fingers pinch to zoom and move the page; Ctrl or ⌘ with the wheel or trackpad zooms too.
//   - The line being drawn, the lasso and the laser are drawn straight into an overlay (no React work while the pen
//     moves); finished strokes go to the sheet's SVG (lib/ink).
import { PaintBucket } from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { Stroke } from '../../../api/types';
import {
  InkSheet,
  addPoint,
  eraseFrom,
  laserSegments,
  lassoed,
  liveTrail,
  moved,
  strokeId,
  strokePath,
  touches,
  unionBounds,
  type InkStroke,
  type LaserPoint,
  type Point,
} from '../../../lib/ink';
import { cx, Icon, glyph } from '../../../ui';
import type { Paper } from '../draft';
import type { LoadedPdf } from '../pdf';
import { FreePictureLayer, type FreePictureLayerProps } from '../pictures/FreePictureLayer';
import { inkStep, type SheetChange, type Step } from '../timeline';
import {
  LINE,
  SHEET_WIDTH,
  TEXT_SIDE,
  TEXT_TOP,
  TEXT_WIDTH,
  clampZoom,
  layoutSheets,
  sheetAt,
  type Placed,
  type SheetSpec,
} from './layout';
import { PdfPage } from './PdfPage';
import type { PenSettings, Tool } from './tools';

/** A zoom, and where it is anchored: the point of the page (`unit`, in column units) that goes under `client` (a point
 *  on screen). Without `unit`, the point under `client` stays where it is. */
export interface ZoomAnchor {
  client: { x: number; y: number };
  unit?: { x: number; y: number };
}

export interface SurfaceProps {
  sheets: readonly SheetSpec[];
  paper: Paper;
  zoom: number;
  onZoom: (zoom: number, anchor: ZoomAnchor) => void;
  tool: Tool;
  onTool: (tool: Tool) => void;
  pens: PenSettings;
  /** whether a finger draws with the ink tools (false once a stylus was used) */
  fingerDraws: boolean;
  /** a stylus touched the surface */
  onStylus: () => void;
  strokesOf: (sheet: number) => readonly Stroke[];
  /** bumps when any sheet's strokes change */
  revision: number;
  /** a gesture changed the ink: record it (undo) and save it */
  onInk: (step: Step) => void;
  pdf: LoadedPdf | null;
  /** the typed text, laid on the paper */
  text: ReactNode;
  /** the paper was pressed below the typed text, on line `line` (0 the first line of text), while typing */
  onPaperPress?: (line: number) => void;
  /** below the last sheet (Add a page) */
  footer?: ReactNode;
  readOnly: boolean;
  /** the element the pages scroll in */
  scroller: HTMLElement | null;
  /** the typed text's height in units, as it changes */
  onTextHeight: (units: number) => void;
  /** the pictures free on the pages, and what editing them needs */
  pictures: Omit<FreePictureLayerProps, 'layout' | 'zoom' | 'scroller'> | null;
}

type Gesture =
  | { kind: 'draw'; pointerId: number; sheet: Placed; stroke: InkStroke }
  | {
      kind: 'erase';
      pointerId: number;
      touched: Map<number, { before: readonly InkStroke[]; now: readonly InkStroke[] }>;
    }
  | { kind: 'lasso'; pointerId: number; sheet: Placed; poly: Point[] }
  | { kind: 'drag'; pointerId: number; sheet: number; ids: ReadonlySet<string>; from: Point }
  | { kind: 'laser'; pointerId: number };

interface Selection {
  sheet: number;
  ids: ReadonlySet<string>;
}

const PRESSURE_DEFAULT = 0.5;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The selection's toolbar: its height, and its gap above the selection (pixels). */
const BAR_HEIGHT = 48;
const BAR_GAP = 10;

function pressureOf(e: PointerEvent): number {
  if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
  return PRESSURE_DEFAULT;
}

export function Surface({
  sheets,
  paper,
  zoom,
  onZoom,
  tool,
  onTool,
  pens,
  fingerDraws,
  onStylus,
  strokesOf,
  revision,
  onInk,
  pdf,
  text,
  onPaperPress,
  footer,
  readOnly,
  scroller,
  onTextHeight,
  pictures,
}: SurfaceProps) {
  const layout = useMemo(() => layoutSheets(sheets), [sheets]);
  const stack = useRef<HTMLDivElement>(null);
  const liveGroup = useRef<SVGGElement>(null);
  const livePath = useRef<SVGPathElement>(null);
  const lassoLine = useRef<SVGPolylineElement>(null);
  const laserGroup = useRef<SVGGElement>(null);
  const eraserRing = useRef<SVGCircleElement>(null);
  const textBox = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const pinching = useRef(false);
  const trail = useRef<LaserPoint[]>([]);
  const frame = useRef(0);
  const [preview, setPreview] = useState<ReadonlyMap<number, readonly InkStroke[]> | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);

  const live = useRef({
    zoom,
    layout,
    tool,
    pens,
    readOnly,
    fingerDraws,
    onInk,
    strokesOf,
    onTool,
    onStylus,
    onZoom,
    selection,
  });
  useEffect(() => {
    live.current = {
      zoom,
      layout,
      tool,
      pens,
      readOnly,
      fingerDraws,
      onInk,
      strokesOf,
      onTool,
      onStylus,
      onZoom,
      selection,
    };
  });

  // The lasso's selection lasts while the lasso is the tool and the sheet still has those strokes.
  useEffect(() => {
    if (tool !== 'lasso') setSelection(null);
  }, [tool]);
  useEffect(() => {
    setSelection((sel) => {
      if (!sel) return sel;
      const ids = new Set(
        strokesOf(sel.sheet)
          .filter((s) => sel.ids.has(s.id))
          .map((s) => s.id),
      );
      return ids.size ? (ids.size === sel.ids.size ? sel : { sheet: sel.sheet, ids }) : null;
    });
  }, [revision, strokesOf]);

  // ── where a pointer is: the sheet under it, the point on that sheet, and the point in the column (units) ──
  const locate = useCallback((clientX: number, clientY: number, sheet?: Placed) => {
    const el = stack.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const z = live.current.zoom;
    const ux = (clientX - rect.left) / z;
    const uy = (clientY - rect.top) / z;
    const s = sheet ?? sheetAt(live.current.layout, uy);
    if (!s) return null;
    return { sheet: s, x: ux, y: uy - s.top, ux, uy };
  }, []);

  // ── the laser's trail ──
  const drawLaser = useCallback(() => {
    const g = laserGroup.current;
    if (!g) return;
    const now = performance.now();
    trail.current = liveTrail(trail.current, now);
    const segs = laserSegments(trail.current, now);
    const lines = segs.map((s) => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(s.x1));
      line.setAttribute('y1', String(s.y1));
      line.setAttribute('x2', String(s.x2));
      line.setAttribute('y2', String(s.y2));
      line.setAttribute('stroke-opacity', s.alpha.toFixed(3));
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      return line;
    });
    g.replaceChildren(...lines);
    frame.current = trail.current.length ? requestAnimationFrame(drawLaser) : 0;
  }, []);
  const laserAt = useCallback(
    (ux: number, uy: number) => {
      trail.current.push({ x: ux, y: uy, t: performance.now() });
      if (!frame.current) frame.current = requestAnimationFrame(drawLaser);
    },
    [drawLaser],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // ── the overlay ──
  const showLive = (g: Extract<Gesture, { kind: 'draw' }>) => {
    const group = liveGroup.current;
    const path = livePath.current;
    if (!group || !path) return;
    group.setAttribute('transform', `translate(0 ${g.sheet.top})`);
    path.setAttribute('d', strokePath(g.stroke, false));
    path.setAttribute('fill', g.stroke.color);
    path.setAttribute('class', g.stroke.tool === 'highlighter' ? 'ink-highlighter' : '');
  };
  const clearOverlay = () => {
    livePath.current?.setAttribute('d', '');
    lassoLine.current?.setAttribute('points', '');
    eraserRing.current?.setAttribute('r', '0');
  };

  const eraseAt = (g: Extract<Gesture, { kind: 'erase' }>, sheet: Placed, x: number, y: number) => {
    const { pens: p } = live.current;
    const r = p.eraser.size / 2;
    let entry = g.touched.get(sheet.index);
    const current = entry?.now ?? live.current.strokesOf(sheet.index);
    let next: InkStroke[];
    if (p.eraser.mode === 'stroke') next = current.filter((s) => !touches(s, x, y, r));
    else next = current.flatMap((s) => eraseFrom(s, x, y, r));
    if (next.length === current.length && next.every((s, i) => s === current[i])) return;
    if (!entry) {
      entry = { before: current, now: next };
      g.touched.set(sheet.index, entry);
    } else entry.now = next;
    setPreview(new Map([...g.touched].map(([n, e]) => [n, e.now])));
  };

  const cancel = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'erase') setPreview(null);
    if (g.kind === 'drag') {
      dragOffset.current = null;
      setDrag(null);
    }
    clearOverlay();
  }, []);

  // ── pointers ──
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ev = e.nativeEvent;
    const { tool: t, readOnly: ro, fingerDraws: fingers, pens: p, selection: sel } = live.current;
    if (ev.pointerType === 'pen') live.current.onStylus();
    if (gesture.current || pinching.current) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    let active = t;
    if (t === 'type') {
      if (ev.pointerType !== 'pen' || ro) return; // fingers and the mouse type; a stylus writes
      active = 'pen';
      live.current.onTool('pen');
    } else if (ev.pointerType === 'touch' && !fingers) return; // fingers scroll: the stylus writes
    if (ro && active !== 'laser') return;
    const at = locate(ev.clientX, ev.clientY);
    if (!at) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(ev.pointerId);

    if (active === 'pen' || active === 'highlighter') {
      const settings = active === 'pen' ? p.pen : p.highlighter;
      const points: number[] = [];
      addPoint(points, at.x, at.y, pressureOf(ev));
      const g: Gesture = {
        kind: 'draw',
        pointerId: ev.pointerId,
        sheet: at.sheet,
        stroke: { id: strokeId(), tool: active, color: settings.color, width: settings.width, points },
      };
      gesture.current = g;
      showLive(g);
    } else if (active === 'eraser') {
      const g: Gesture = { kind: 'erase', pointerId: ev.pointerId, touched: new Map() };
      gesture.current = g;
      eraserRing.current?.setAttribute('cx', String(at.ux));
      eraserRing.current?.setAttribute('cy', String(at.uy));
      eraserRing.current?.setAttribute('r', String(p.eraser.size / 2));
      eraseAt(g, at.sheet, at.x, at.y);
    } else if (active === 'lasso') {
      if (sel && sel.sheet === at.sheet.index) {
        const box = unionBounds(live.current.strokesOf(sel.sheet).filter((s) => sel.ids.has(s.id)));
        if (box && at.x >= box.x - 8 && at.x <= box.x + box.w + 8 && at.y >= box.y - 8 && at.y <= box.y + box.h + 8) {
          gesture.current = {
            kind: 'drag',
            pointerId: ev.pointerId,
            sheet: sel.sheet,
            ids: sel.ids,
            from: [at.x, at.y],
          };
          dragOffset.current = { dx: 0, dy: 0 };
          setDrag({ dx: 0, dy: 0 });
          return;
        }
      }
      setSelection(null);
      gesture.current = { kind: 'lasso', pointerId: ev.pointerId, sheet: at.sheet, poly: [[at.x, at.y]] };
    } else if (active === 'laser') {
      gesture.current = { kind: 'laser', pointerId: ev.pointerId };
      laserAt(at.ux, at.uy);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ev = e.nativeEvent;
    const g = gesture.current;
    // The laser follows a hovering mouse or stylus too: pointing at something without touching.
    if (!g) {
      if (live.current.tool === 'laser' && ev.pointerType !== 'touch') {
        const at = locate(ev.clientX, ev.clientY);
        if (at) laserAt(at.ux, at.uy);
      }
      return;
    }
    if (ev.pointerId !== g.pointerId) return;
    const events = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
    const all = events.length ? events : [ev];
    if (g.kind === 'draw') {
      for (const c of all) {
        const at = locate(c.clientX, c.clientY, g.sheet);
        if (at) addPoint(g.stroke.points, at.x, at.y, pressureOf(c));
      }
      showLive(g);
    } else if (g.kind === 'erase') {
      for (const c of all) {
        const at = locate(c.clientX, c.clientY);
        if (!at) continue;
        eraserRing.current?.setAttribute('cx', String(at.ux));
        eraserRing.current?.setAttribute('cy', String(at.uy));
        eraseAt(g, at.sheet, at.x, at.y);
      }
    } else if (g.kind === 'lasso') {
      const at = locate(ev.clientX, ev.clientY, g.sheet);
      if (!at) return;
      g.poly.push([at.x, at.y]);
      lassoLine.current?.setAttribute('points', g.poly.map(([x, y]) => `${x},${y + g.sheet.top}`).join(' '));
    } else if (g.kind === 'drag') {
      const placed = live.current.layout.sheets.find((s) => s.index === g.sheet);
      const at = placed ? locate(ev.clientX, ev.clientY, placed) : null;
      if (at) {
        const d = { dx: at.x - g.from[0], dy: at.y - g.from[1] };
        dragOffset.current = d;
        setDrag(d);
      }
    } else if (g.kind === 'laser') {
      const at = locate(ev.clientX, ev.clientY);
      if (at) laserAt(at.ux, at.uy);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.nativeEvent.pointerId !== g.pointerId) return;
    gesture.current = null;
    const { strokesOf: of, onInk: commit } = live.current;
    if (g.kind === 'draw') {
      if (g.stroke.points.length >= 3) {
        const before = of(g.sheet.index);
        commit(inkStep(g.sheet.index, before, [...before, { ...g.stroke, points: g.stroke.points.slice() }]));
      }
    } else if (g.kind === 'erase') {
      const changes: SheetChange[] = [...g.touched].map(([sheet, entry]) => ({
        sheet,
        before: entry.before,
        after: entry.now,
      }));
      if (changes.length) commit({ kind: 'page', ink: changes });
      setPreview(null);
    } else if (g.kind === 'lasso') {
      const strokes = of(g.sheet.index);
      const picked = lassoed(strokes, g.poly);
      setSelection(picked.length ? { sheet: g.sheet.index, ids: new Set(picked.map((s) => s.id)) } : null);
    } else if (g.kind === 'drag') {
      const d = dragOffset.current;
      dragOffset.current = null;
      setDrag(null);
      if (d && (Math.abs(d.dx) > 0.5 || Math.abs(d.dy) > 0.5)) {
        const before = of(g.sheet);
        commit(
          inkStep(
            g.sheet,
            before,
            before.map((s) => (g.ids.has(s.id) ? moved(s, d.dx, d.dy) : s)),
          ),
        );
      }
    }
    clearOverlay();
  };

  // While typing, pressing the paper below the text puts the caret there, on that line (notebook apps type anywhere).
  const onPaperDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (live.current.tool !== 'type' || readOnly || !onPaperPress || e.nativeEvent.pointerType === 'pen') return;
    const box = textBox.current;
    if (!box || box.contains(e.target as Node)) return;
    const at = locate(e.clientX, e.clientY);
    if (!at || at.sheet.kind !== 'paper') return;
    const line = Math.floor((at.uy - layout.paperTop - TEXT_TOP) / LINE);
    if (line < 0) return;
    e.preventDefault();
    onPaperPress(line);
  };

  // ── two fingers: move the page and pinch to zoom; Ctrl/⌘ + wheel zooms ──
  useEffect(() => {
    if (!scroller) return undefined;
    let start: { d: number; zoom: number; unit: { x: number; y: number } } | null = null;
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const dist = (t: TouchList) => Math.max(1, Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY));
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinching.current = true;
      if (gesture.current && gesture.current.kind !== 'laser') cancel();
      const el = stack.current;
      if (!el) return;
      const m = mid(e.touches);
      const rect = el.getBoundingClientRect();
      const z = live.current.zoom;
      start = { d: dist(e.touches), zoom: z, unit: { x: (m.x - rect.left) / z, y: (m.y - rect.top) / z } };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      const z = clampZoom((start.zoom * dist(e.touches)) / start.d);
      // the point of the page that was between the fingers stays between them, wherever they go
      live.current.onZoom(z, { client: mid(e.touches), unit: start.unit });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        start = null;
        if (e.touches.length === 0) pinching.current = false;
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      live.current.onZoom(clampZoom(live.current.zoom * Math.exp(-e.deltaY * 0.01)), {
        client: { x: e.clientX, y: e.clientY },
      });
    };
    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd, { passive: true });
    scroller.addEventListener('touchcancel', onEnd, { passive: true });
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
      scroller.removeEventListener('wheel', onWheel);
    };
  }, [scroller, cancel]);

  // ── the selection: delete, recolour, duplicate; Delete and Escape from the keyboard ──
  const selected = selection ? strokesOf(selection.sheet).filter((s) => selection.ids.has(s.id)) : [];
  const box = unionBounds(selected);
  const removeSelection = useCallback(() => {
    if (!selection) return;
    const before = strokesOf(selection.sheet);
    onInk(
      inkStep(
        selection.sheet,
        before,
        before.filter((s) => !selection.ids.has(s.id)),
      ),
    );
    setSelection(null);
  }, [selection, strokesOf, onInk]);
  const recolour = () => {
    if (!selection) return;
    const before = strokesOf(selection.sheet);
    const after = before.map((s) =>
      selection.ids.has(s.id) ? { ...s, color: s.tool === 'highlighter' ? pens.highlighter.color : pens.pen.color } : s,
    );
    onInk(inkStep(selection.sheet, before, after));
  };
  const duplicate = () => {
    if (!selection) return;
    const before = strokesOf(selection.sheet);
    const copies = before.filter((s) => selection.ids.has(s.id)).map((s) => ({ ...moved(s, 16, 16), id: strokeId() }));
    onInk(inkStep(selection.sheet, before, [...before, ...copies]));
    setSelection({ sheet: selection.sheet, ids: new Set(copies.map((s) => s.id)) });
  };
  useEffect(() => {
    if (!selection) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelection();
      } else if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, removeSelection]);

  // ── the typed text's height: the paper grows to hold it ──
  useEffect(() => {
    const el = textBox.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => onTextHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onTextHeight]);

  // A change of zoom drops a half-made gesture: its points were taken at the old zoom.
  useLayoutEffect(() => {
    if (gesture.current && gesture.current.kind !== 'laser') cancel();
  }, [zoom, cancel]);

  const inking = tool !== 'type';
  const paperSheets = layout.sheets.filter((s) => s.kind === 'paper');
  const pdfSheets = layout.sheets.filter((s) => s.kind === 'pdf');
  const selSheet = selection ? layout.sheets.find((s) => s.index === selection.sheet) : null;
  const width = SHEET_WIDTH * zoom;

  const sheetInk = (s: Placed) => (
    <InkSheet
      strokes={preview?.get(s.index) ?? (strokesOf(s.index) as readonly InkStroke[])}
      width={SHEET_WIDTH}
      height={s.height}
      selected={selection?.sheet === s.index ? selection.ids : undefined}
      offset={selection?.sheet === s.index ? drag : null}
    />
  );

  // The selection's toolbar, above it (below it when there is no room), in pixels: it keeps its size at any zoom.
  let bar: { left: number; top: number } | null = null;
  if (selection && box && selSheet && !drag) {
    const top = (selSheet.top + box.y - 6) * zoom - BAR_HEIGHT - BAR_GAP;
    bar = {
      left: Math.max(0, Math.min(width - 300, (box.x - 6) * zoom)),
      top: top >= 0 ? top : (selSheet.top + box.y + box.h + 6) * zoom + BAR_GAP,
    };
  }

  return (
    <>
      <div className="nb-canvas" style={{ width, height: layout.height * zoom }}>
        <div
          ref={stack}
          className={cx(
            'nb-stack',
            inking && 'is-inking',
            inking && fingerDraws && !readOnly && 'is-finger-ink',
            `is-tool-${tool}`,
          )}
          style={{ width: SHEET_WIDTH, height: layout.height, transform: `scale(${zoom})`, ['--z' as string]: zoom }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => cancel()}
          onPointerLeave={(e) => {
            if (!gesture.current && e.nativeEvent.pointerType === 'mouse')
              trail.current = liveTrail(trail.current, performance.now());
          }}
          data-hub="note-surface"
        >
          {pdfSheets.map((s) => (
            <div
              key={s.index}
              className="nb-sheet nb-sheet--pdf"
              style={{ top: s.top, height: s.height }}
              data-sheet={s.index}
            >
              {pdf && s.page ? (
                <PdfPage pdf={pdf} page={s.page} width={SHEET_WIDTH} height={s.height} zoom={zoom} root={scroller} />
              ) : null}
              <div className="nb-sheet__ink">{sheetInk(s)}</div>
            </div>
          ))}
          {paperSheets.length ? (
            <div
              className={cx('nb-paper', `nb-paper--${paper}`)}
              style={{ top: layout.paperTop, height: layout.paperHeight }}
              onPointerDown={onPaperDown}
              data-sheet={paperSheets[0].index}
            >
              {paperSheets.slice(1).map((s, i) => (
                <span
                  key={s.index}
                  className="nb-paper__break"
                  style={{ top: s.top - layout.paperTop }}
                  aria-hidden="true"
                >
                  <span>{i + 2}</span>
                </span>
              ))}
              <div
                ref={textBox}
                className="nb-paper__text"
                style={{ top: TEXT_TOP, left: TEXT_SIDE, width: TEXT_WIDTH }}
              >
                {text}
              </div>
              {paperSheets.map((s) => (
                <div
                  key={s.index}
                  className="nb-sheet__ink"
                  style={{ top: s.top - layout.paperTop, height: s.height }}
                  data-sheet={s.index}
                >
                  {sheetInk(s)}
                </div>
              ))}
            </div>
          ) : null}
          {pictures ? <FreePictureLayer {...pictures} layout={layout} zoom={zoom} scroller={scroller} /> : null}
          <svg
            className="nb-overlay"
            width={SHEET_WIDTH}
            height={layout.height}
            viewBox={`0 0 ${SHEET_WIDTH} ${layout.height}`}
            aria-hidden="true"
          >
            <g ref={liveGroup}>
              <path ref={livePath} />
            </g>
            <polyline ref={lassoLine} className="nb-overlay__lasso" vectorEffect="non-scaling-stroke" />
            <circle ref={eraserRing} className="nb-overlay__eraser" r={0} vectorEffect="non-scaling-stroke" />
            <g ref={laserGroup} className="nb-overlay__laser" />
          </svg>
        </div>
        {bar ? (
          <div
            className="nb-selbar"
            role="toolbar"
            aria-label="Selected writing"
            style={{ left: bar.left, top: bar.top }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={duplicate}>
              <Icon glyph={glyph.copy} /> Duplicate
            </button>
            <button type="button" onClick={recolour} title="Give it the colours the pen and the highlighter have now">
              <PaintBucket aria-hidden="true" /> Recolour
            </button>
            <button type="button" onClick={removeSelection} className="is-danger">
              <Icon glyph={glyph.trash} /> Delete
            </button>
          </div>
        ) : null}
      </div>
      {footer ? <div className="nb-footer">{footer}</div> : null}
    </>
  );
}
