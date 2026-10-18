// The note's free pictures on its pages, and everything that edits them. They lie over the paper and the typed text and
// under the ink, so the pen writes on them. With the Type tool a picture is picked by a tap, a click or Tab; then it is
//   - dragged anywhere on its page or on to another one (a finger moves only a picture already picked: on any other it
//     scrolls the page, and a stylus writes on it),
//   - resized from a corner, keeping its shape unless "Keep its shape" is off (Shift does the other one),
//   - turned by its handle (snapping to quarter turns; Shift turns in 15 degree steps) or a quarter at a time,
//   - cropped, brought forward or sent back among the free pictures, put in line with the text, described or deleted.
// From the keyboard the arrow keys move it (with Shift, a ruled line at a time), Delete deletes it, Escape lets go of it
// and Tab goes to its toolbar. Its handles and toolbar keep their size at any zoom; 44 px on a touch screen.
import {
  ArrowClockwise,
  ArrowSquareOut,
  Check,
  Crop,
  LockSimple,
  LockSimpleOpen,
  SelectionBackground,
  SelectionForeground,
  TextT,
  Trash,
  X,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../../state';
import { cx, type MenuItem } from '../../../ui';
import { noteFileHref } from '../api';
import { SHEET_WIDTH, type Layout } from '../surface/layout';
import { BarMenu, BlockBarButton, PlacementSwitch } from '../text/BlockBar';
import { CROP_HANDLES, rectStyle } from '../text/crop';
import { FULL, dragCrop, type Edges, type Rect } from '../text/picture';
import { DetailsDialog } from './DetailsDialog';
import { Cropped } from './FreePictureView';
import {
  CORNERS,
  NUDGE,
  NUDGE_FAR,
  angleTowards,
  bounds,
  broughtForward,
  croppedTo,
  keptAcross,
  landed,
  middle,
  movedBy,
  quarterTurned,
  resizedTo,
  sentBackward,
  settle,
  turn,
  type Corner,
  type FreePicture,
  type Point,
} from './geometry';
import { boxStyle } from './style';
import type { FreePictures } from './useFreePictures';

/** How far (pixels) a press moves before it becomes a drag. */
const THRESHOLD = 5;
/** Pixels from the top or bottom of the view where the page scrolls by itself while a picture is dragged. */
const EDGE = 56;
const SCROLL_STEP = 12;
/** The turn handle: how far above the picture it is, and the room it takes (pixels). */
const KNOB_OFF = 28;
const KNOB = 22;
/** The toolbar's gap from what it is over, and how far it may go past the page's sides (pixels). */
const BAR_GAP = 10;
const BAR_SIDE = 12;
/** A picture nudged with the arrow keys is saved this long after the last press: a run of presses is one step to
 *  undo. */
const NUDGE_SAVE = 600;

export interface FreePictureLayerProps {
  free: FreePictures;
  layout: Layout;
  zoom: number;
  /** pictures are picked and edited (the Type tool, in a note that can be changed) */
  active: boolean;
  keepShape: boolean;
  onKeepShape: (on: boolean) => void;
  /** the element the pages scroll in */
  scroller: HTMLElement | null;
  /** why a free picture can't go in line now, or null when it can */
  inlineOff: string | null;
  /** put a free picture in the text: `top` is its top on screen (pixels) */
  onInline: (p: FreePicture, top: number) => void;
  /** a picture was deleted, or let go of from the keyboard: where the focus goes */
  onLeave: () => void;
}

/** Follows one pointer from a press until it lets go; a second pointer (a pinch) or Escape cancels. */
function track(
  e: ReactPointerEvent<HTMLElement>,
  onMove: (ev: PointerEvent) => void,
  onEnd: (done: boolean) => void,
): () => void {
  const el = e.currentTarget;
  const id = e.pointerId;
  el.setPointerCapture(id);
  const move = (ev: PointerEvent) => {
    if (ev.pointerId === id) onMove(ev);
  };
  const up = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(true);
  };
  const cancel = (ev: PointerEvent) => {
    if (ev.pointerId === id) finish(false);
  };
  const other = (ev: PointerEvent) => {
    if (ev.pointerId !== id) finish(false);
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    finish(false);
  };
  let over = false;
  function finish(done: boolean) {
    if (over) return;
    over = true;
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    window.removeEventListener('pointerdown', other, true);
    window.removeEventListener('keydown', key, true);
    onEnd(done);
  }
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  window.addEventListener('pointerdown', other, true);
  window.addEventListener('keydown', key, true);
  return () => finish(false);
}

const describe = (p: FreePicture): string => p.alt || p.caption || 'Picture';

/** The toolbar of the picture picked, in the page's pixels: above it (and its turn handle), or below when there is no
 *  room, and within the page's width as far as it goes. */
function PictureBar({
  anchor,
  width,
  label,
  onKeyDown,
  barRef,
  children,
}: {
  anchor: { left: number; top: number; right: number; bottom: number };
  /** the page's width (pixels) */
  width: number;
  label: string;
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  barRef: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const measure = () => {
      const next = { w: el.offsetWidth, h: el.offsetHeight };
      setSize((s) => (s && s.w === next.w && s.h === next.h ? s : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [barRef]);
  let style: CSSProperties = { visibility: 'hidden', left: 0, top: 0 };
  if (size) {
    const above = anchor.top - BAR_GAP - size.h;
    const mid = (anchor.left + anchor.right) / 2 - size.w / 2;
    const left =
      size.w > width + 2 * BAR_SIDE
        ? (width - size.w) / 2
        : Math.min(width + BAR_SIDE - size.w, Math.max(-BAR_SIDE, mid));
    style = { left, top: above >= 0 ? above : anchor.bottom + BAR_GAP };
  }
  return (
    <div
      ref={barRef}
      className="nb-picbar"
      role="toolbar"
      aria-label={label}
      style={style}
      data-hub="free-picture-bar"
      // the page's gestures don't start from the toolbar, and pressing it keeps the picture focused
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLElement && e.target.closest('a'))) e.preventDefault();
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export function FreePictureLayer({
  free,
  layout,
  zoom,
  active,
  keepShape,
  onKeepShape,
  scroller,
  inlineOff,
  onInline,
  onLeave,
}: FreePictureLayerProps) {
  const { list, select, change, remove: removePicture, reorder } = free;
  const root = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hint = useId();
  const narrow = useMediaQuery('(max-width: 699px)');
  const [canvas, setCanvas] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setCanvas(root.current?.closest<HTMLElement>('.nb-canvas') ?? null), []);

  // a picture being moved, resized, turned or nudged: shown as it goes, saved when it ends
  const [live, setLiveState] = useState<FreePicture | null>(null);
  const liveRef = useRef<FreePicture | null>(null);
  const setLive = useCallback((p: FreePicture | null) => {
    liveRef.current = p;
    setLiveState(p);
  }, []);
  // a pointer gesture under way (moving, resizing, turning): the toolbar waits; `moving` hides the handles too
  const [gesturing, setGesturing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [cropping, setCropping] = useState<Rect | null>(null);
  const [details, setDetails] = useState(false);
  const cancelGesture = useRef<(() => void) | null>(null);
  const lastPointer = useRef('mouse');
  const nudge = useRef<ReturnType<typeof setTimeout> | null>(null);

  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });
  const sheets = useMemo(() => new Map(layout.sheets.map((s) => [s.index, s])), [layout]);
  const selected = active ? free.selected : null;
  const selSheet = selected ? sheets.get(selected.sheet) : undefined;
  const shown = (p: FreePicture) => (live && live.id === p.id ? live : p);
  /** The picture as it is now: with a nudge not saved yet. */
  const current = (p: FreePicture) => (liveRef.current?.id === p.id ? liveRef.current : p);

  const elementOf = useCallback(
    (id: string) => root.current?.querySelector<HTMLElement>(`[data-picture="${CSS.escape(id)}"]`) ?? null,
    [],
  );
  const focusPicture = useCallback((id: string) => elementOf(id)?.focus({ preventScroll: true }), [elementOf]);

  /** A point on screen, in the column's units. */
  const columnPoint = (clientX: number, clientY: number): Point | null => {
    const stack = root.current?.parentElement;
    if (!stack) return null;
    const r = stack.getBoundingClientRect();
    return { x: (clientX - r.left) / zoomRef.current, y: (clientY - r.top) / zoomRef.current };
  };

  // The tool changed, or the note can't be changed: nothing stays picked, nothing half done.
  useEffect(() => {
    if (active) return;
    cancelGesture.current?.();
    select(null);
    setCropping(null);
  }, [active, select]);
  // A zoom drops a gesture under way: its points were taken at the old zoom; so does leaving the note.
  useLayoutEffect(() => {
    cancelGesture.current?.();
  }, [zoom]);
  useEffect(() => () => cancelGesture.current?.(), []);
  // Letting go of a picture ends its cropping.
  useEffect(() => {
    if (!selected) setCropping(null);
  }, [selected]);

  const saveNudge = useCallback(() => {
    if (nudge.current) clearTimeout(nudge.current);
    nudge.current = null;
    const next = liveRef.current;
    if (!next) return;
    setLive(null);
    change(next);
  }, [change, setLive]);
  useEffect(
    () => () => {
      if (nudge.current) clearTimeout(nudge.current);
    },
    [],
  );

  // Pressing anywhere else lets go of the picture (its toolbar, its menu and its dialog are part of it).
  useEffect(() => {
    if (!selected) return undefined;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest(`[data-picture="${CSS.escape(selected.id)}"], .nb-free-chrome, .nb-picbar, .ui-menu, [role="dialog"]`)
      )
        return;
      saveNudge();
      select(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [selected, select, saveNudge]);

  // While cropping: Enter keeps the crop, Escape leaves it as it was.
  const keepCrop = useCallback(() => {
    if (selected && cropping && selSheet) change(settle(croppedTo(selected, cropping), selSheet.height));
    setCropping(null);
    if (selected) focusPicture(selected.id);
  }, [selected, cropping, selSheet, change, focusPicture]);
  useEffect(() => {
    if (!cropping) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setCropping(null);
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLElement && e.target.closest('.ui-menu'))) {
        e.preventDefault();
        e.stopPropagation();
        keepCrop();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cropping, keepCrop]);

  const pick = (p: FreePicture) => {
    if (free.selected?.id !== p.id) {
      saveNudge();
      setCropping(null);
      select(p.id);
    }
    focusPicture(p.id);
  };

  // ── moving ──
  const onPress = (p: FreePicture) => (e: ReactPointerEvent<HTMLElement>) => {
    lastPointer.current = e.pointerType;
    if (!active || cropping || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const isSelected = free.selected?.id === p.id;
    // a finger on a picture not picked scrolls the page, and a stylus writes on it (a tap picks it: onClick)
    if (!isSelected && e.pointerType !== 'mouse') return;
    e.stopPropagation();
    const from = sheets.get(p.sheet);
    if (!from) return;
    const start = current(p);
    saveNudge();
    pick(p);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let dragging = false;
    let scrolled = 0;
    let last = { x: x0, y: y0 };
    let frame = 0;
    const place = () => {
      const z = zoomRef.current;
      setLive(keptAcross(movedBy(start, (last.x - x0) / z, (last.y - y0 + scrolled) / z)));
    };
    // near the top or bottom of the view, the page scrolls by itself while the picture is held there
    const edgeScroll = () => {
      frame = 0;
      if (!scroller || !dragging) return;
      const s = scroller.getBoundingClientRect();
      const step = last.y < s.top + EDGE ? -SCROLL_STEP : last.y > s.bottom - EDGE ? SCROLL_STEP : 0;
      if (!step) return;
      const before = scroller.scrollTop;
      scroller.scrollTop += step;
      scrolled += scroller.scrollTop - before;
      place();
      frame = requestAnimationFrame(edgeScroll);
    };
    cancelGesture.current = track(
      e,
      (ev) => {
        last = { x: ev.clientX, y: ev.clientY };
        if (!dragging) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < THRESHOLD) return;
          dragging = true;
          setMoving(true);
          setGesturing(true);
        }
        ev.preventDefault();
        place();
        if (!frame) frame = requestAnimationFrame(edgeScroll);
      },
      (done) => {
        cancelAnimationFrame(frame);
        cancelGesture.current = null;
        setMoving(false);
        setGesturing(false);
        const next = liveRef.current;
        setLive(null);
        if (done && dragging && next) change(landed(next, from, layout.sheets));
      },
    );
  };

  // ── resizing and turning ──
  const onCorner = (corner: Corner) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!selected || !selSheet || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.stopPropagation();
    e.preventDefault();
    const start = current(selected);
    const sheet = selSheet;
    saveNudge();
    setGesturing(true);
    cancelGesture.current = track(
      e,
      (ev) => {
        const at = columnPoint(ev.clientX, ev.clientY);
        if (!at) return;
        const keep = keepShape !== ev.shiftKey;
        setLive(resizedTo(start, corner, { x: at.x, y: at.y - sheet.top }, { keepShape: keep, height: sheet.height }));
      },
      (done) => {
        cancelGesture.current = null;
        setGesturing(false);
        const next = liveRef.current;
        setLive(null);
        if (done && next) change(settle(next, sheet.height));
      },
    );
  };
  const onTurnHandle = (e: ReactPointerEvent<HTMLElement>) => {
    if (!selected || !selSheet || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.stopPropagation();
    e.preventDefault();
    const start = current(selected);
    const sheet = selSheet;
    saveNudge();
    setGesturing(true);
    cancelGesture.current = track(
      e,
      (ev) => {
        const at = columnPoint(ev.clientX, ev.clientY);
        if (at) setLive({ ...start, angle: angleTowards(start, { x: at.x, y: at.y - sheet.top }, ev.shiftKey) });
      },
      (done) => {
        cancelGesture.current = null;
        setGesturing(false);
        const next = liveRef.current;
        setLive(null);
        if (done && next) change(settle(next, sheet.height));
      },
    );
  };

  // ── cropping: the whole picture shows, turned as it is, with the part kept marked on it ──
  const onCrop = (edges: Edges) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!selected || !cropping || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.stopPropagation();
    e.preventDefault();
    const start = cropping;
    const whole = { w: selected.w / selected.crop.w, h: selected.h / selected.crop.h };
    const angle = selected.angle;
    const x0 = e.clientX;
    const y0 = e.clientY;
    cancelGesture.current = track(
      e,
      (ev) => {
        const z = zoomRef.current;
        const d = turn({ x: (ev.clientX - x0) / z, y: (ev.clientY - y0) / z }, -angle);
        setCropping(dragCrop(start, edges, d.x / whole.w, d.y / whole.h));
      },
      (done) => {
        cancelGesture.current = null;
        if (!done) setCropping(start);
      },
    );
  };

  // ── the keyboard ──
  const onKey = (p: FreePicture) => (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!active || e.target !== e.currentTarget) return;
    const step = e.shiftKey ? NUDGE_FAR : NUDGE;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const by = arrows[e.key];
    if (by && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (cropping) return;
      if (free.selected?.id !== p.id) select(p.id);
      const sheet = sheets.get(p.sheet);
      if (!sheet) return;
      setLive(settle(movedBy(current(p), by[0], by[1]), sheet.height));
      if (nudge.current) clearTimeout(nudge.current);
      nudge.current = setTimeout(saveNudge, NUDGE_SAVE);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !cropping) {
      e.preventDefault();
      saveNudge();
      removePicture(p.id);
      onLeave();
    } else if (e.key === 'Escape' && free.selected?.id === p.id && !cropping) {
      e.preventDefault();
      saveNudge();
      select(null);
    } else if (e.key === 'Enter' && free.selected?.id !== p.id) {
      e.preventDefault();
      select(p.id);
    } else if (e.key === 'Tab' && !e.shiftKey && free.selected?.id === p.id) {
      const first = barRef.current?.querySelector<HTMLElement>('button:not(:disabled), a[href]');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    } else if ((e.metaKey || e.ctrlKey) && /^[zy]$/i.test(e.key)) {
      saveNudge(); // undo takes back the nudge too
    }
  };

  // ── the toolbar's actions ──
  const sel = selected ? shown(selected) : null;
  const forward = sel ? broughtForward(list, sel.id) : null;
  const backward = sel ? sentBackward(list, sel.id) : null;
  const turnQuarter = () => {
    if (!sel || !selSheet) return;
    saveNudge();
    change(settle(quarterTurned(sel), selSheet.height));
  };
  const remove = () => {
    if (!sel) return;
    if (nudge.current) clearTimeout(nudge.current);
    nudge.current = null;
    setLive(null);
    removePicture(sel.id);
    onLeave();
  };
  const toInline = () => {
    if (!sel) return;
    const top = elementOf(sel.id)?.getBoundingClientRect().top;
    if (top !== undefined) onInline(sel, top);
  };
  const onBarKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const back = () => {
      e.preventDefault();
      e.stopPropagation();
      if (sel) focusPicture(sel.id);
    };
    if (e.key === 'Escape') back();
    else if (e.key === 'Tab' && e.shiftKey && e.target === barRef.current?.querySelector('button, a')) back();
  };

  const layering: MenuItem[] = [
    {
      id: 'forward',
      label: 'Bring forward',
      icon: SelectionForeground,
      disabled: !forward,
      onSelect: () => forward && reorder(forward),
    },
    {
      id: 'backward',
      label: 'Send back',
      icon: SelectionBackground,
      disabled: !backward,
      onSelect: () => backward && reorder(backward),
    },
  ];
  const more: MenuItem[] = sel
    ? [
        ...(narrow ? [...layering, { divider: true as const }] : []),
        {
          id: 'shape',
          label: 'Keep its shape',
          hint: keepShape ? 'On' : 'Off',
          icon: keepShape ? LockSimple : LockSimpleOpen,
          onSelect: () => onKeepShape(!keepShape),
        },
        { id: 'details', label: 'Caption and description', icon: TextT, onSelect: () => setDetails(true) },
        { id: 'open', label: 'Open full size', icon: ArrowSquareOut, href: noteFileHref(sel.upload) },
      ]
    : [];

  // where the toolbar goes: over the picture's box and its turn handle, in the page's pixels
  let anchor: { left: number; top: number; right: number; bottom: number } | null = null;
  if (sel && selSheet) {
    const b = bounds(sel);
    const m = middle(sel);
    const knob = turn({ x: 0, y: -(sel.h / 2 + KNOB_OFF / zoom) }, sel.angle);
    const kx = (selSheet.top + m.y + knob.y) * zoom;
    const top = (selSheet.top + b.y) * zoom;
    const bottom = (selSheet.top + b.y + b.h) * zoom;
    anchor = {
      left: b.x * zoom,
      right: (b.x + b.w) * zoom,
      top: cropping ? top : Math.min(top, kx - KNOB),
      bottom: cropping ? bottom : Math.max(bottom, kx + KNOB),
    };
  }

  const whole = sel ? { w: sel.w / sel.crop.w, h: sel.h / sel.crop.h } : null;

  return (
    <div ref={root} className="nb-frees" data-hub="note-free-pictures">
      <span id={hint} hidden>
        Arrow keys move it, Shift with them moves it further. Tab goes to its tools, Delete deletes it.
      </span>
      {list.map((p) => {
        const sheet = sheets.get(p.sheet);
        if (!sheet) return null;
        const q = shown(p);
        const isSelected = selected?.id === p.id;
        return (
          <div
            key={p.id}
            className={cx(
              'nb-free',
              active && 'is-live',
              isSelected && 'is-selected',
              live?.id === p.id && 'is-moving',
            )}
            style={boxStyle(q, sheet.top)}
            data-picture={p.id}
            data-hub="note-free-picture"
            role={active ? 'group' : undefined}
            aria-roledescription={active ? 'picture' : undefined}
            aria-label={active ? describe(p) : undefined}
            aria-describedby={active ? hint : undefined}
            tabIndex={active ? 0 : undefined}
            onPointerDown={onPress(p)}
            onClick={() => {
              if (!active || (lastPointer.current === 'pen' && !isSelected)) return;
              pick(p);
            }}
            onFocus={(e) => {
              if (active && e.target === e.currentTarget && free.selected?.id !== p.id) select(p.id);
            }}
            onBlur={() => {
              if (nudge.current) saveNudge();
            }}
            onKeyDown={onKey(p)}
          >
            <Cropped upload={q.upload} alt={q.alt} crop={q.crop} w={q.w} h={q.h} />
            {q.caption ? <p className="nb-free__caption">{q.caption}</p> : null}
          </div>
        );
      })}
      {sel && selSheet && whole ? (
        <div
          className={cx('nb-free-chrome', cropping && 'is-cropping', moving && 'is-moving')}
          style={boxStyle(sel, selSheet.top)}
          aria-hidden="true"
        >
          {cropping ? (
            <div
              className="nb-free-crop"
              style={{ left: -sel.crop.x * whole.w, top: -sel.crop.y * whole.h, width: whole.w, height: whole.h }}
            >
              <Cropped upload={sel.upload} alt="" crop={FULL} w={whole.w} h={whole.h} />
              <div className="nb-crop__clip">
                <div className="nb-crop__shade" style={rectStyle(cropping)} />
              </div>
              <div className="nb-crop__rect" style={rectStyle(cropping)} onPointerDown={onCrop({})}>
                {CROP_HANDLES.map((h) => (
                  <span key={h.id} className={cx('nb-crop__handle', `is-${h.id}`)} onPointerDown={onCrop(h.edges)} />
                ))}
              </div>
            </div>
          ) : moving ? null : (
            <>
              <span className="nb-free-chrome__stem" />
              <span className="nb-free-chrome__turn" onPointerDown={onTurnHandle} title="Turn">
                <ArrowClockwise weight="bold" />
              </span>
              {CORNERS.map((c) => (
                <span key={c} className={cx('nb-free-chrome__corner', `is-${c}`)} onPointerDown={onCorner(c)} />
              ))}
            </>
          )}
        </div>
      ) : null}
      {sel && anchor && canvas && !gesturing
        ? createPortal(
            <PictureBar
              anchor={anchor}
              width={SHEET_WIDTH * zoom}
              label={cropping ? 'Crop' : 'Picture'}
              onKeyDown={onBarKey}
              barRef={barRef}
            >
              {cropping ? (
                <>
                  <BlockBarButton icon={Check} label="Done" text onClick={keepCrop} primary />
                  <BlockBarButton icon={Crop} label="Whole picture" text onClick={() => setCropping(FULL)} />
                  <BlockBarButton icon={X} label="Cancel" onClick={() => setCropping(null)} />
                </>
              ) : (
                <>
                  <PlacementSwitch free onInline={toInline} inlineOff={inlineOff ?? undefined} />
                  <span className="nb-blockbar__sep" aria-hidden="true" />
                  <BlockBarButton
                    icon={Crop}
                    label="Crop"
                    onClick={() => {
                      saveNudge();
                      setCropping(sel.crop);
                    }}
                  />
                  <BlockBarButton icon={ArrowClockwise} label="Turn a quarter" onClick={turnQuarter} />
                  {narrow ? null : (
                    <>
                      <BlockBarButton
                        icon={SelectionForeground}
                        label="Bring forward"
                        onClick={() => forward && reorder(forward)}
                        disabled={!forward}
                      />
                      <BlockBarButton
                        icon={SelectionBackground}
                        label="Send back"
                        onClick={() => backward && reorder(backward)}
                        disabled={!backward}
                      />
                    </>
                  )}
                  <span className="nb-blockbar__sep" aria-hidden="true" />
                  <BarMenu label="More for this picture" items={more} />
                  <BlockBarButton icon={Trash} label="Delete picture" danger onClick={remove} />
                </>
              )}
            </PictureBar>,
            canvas,
          )
        : null}
      {sel && details ? (
        <DetailsDialog
          caption={sel.caption}
          alt={sel.alt}
          onClose={() => setDetails(false)}
          onSave={(v) => {
            change({ ...sel, ...v });
            setDetails(false);
          }}
        />
      ) : null}
    </div>
  );
}
