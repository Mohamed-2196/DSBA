// A picture in the text of a note, and everything that edits it: tap it to select it, then drag it to another place
// (up or down the text, across it, or lower down the page), pull a corner to resize it (its shape stays), crop it,
// turn it, make it free to put it anywhere on the page, give it a caption and a description, open it full size, or
// delete it. Its controls keep their size at any zoom.
import {
  ArrowClockwise,
  ArrowSquareOut,
  Check,
  Crop,
  ImageBroken,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextT,
  Trash,
  X,
} from '@phosphor-icons/react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../../state';
import { cx, type MenuItem } from '../../../ui';
import { noteFileHref } from '../api';
import { DetailsDialog } from '../pictures/DetailsDialog';
import { usePictureSpace } from '../pictures/space';
import { LINE, TEXT_WIDTH } from '../surface/layout';
import { BarMenu, BlockBar, BlockBarButton, PlacementSwitch } from './BlockBar';
import { CROP_HANDLES, rectStyle } from './crop';
import {
  FULL,
  cropAttrs,
  dragCrop,
  fromShown,
  nextTurn,
  pictureAttrs,
  placeAt,
  resized,
  shownRatio,
  toShown,
  turned,
  type Edges,
  type PictureAttrs,
  type Rect,
} from './picture';
import { useBlockMove } from './useBlockMove';

/** Room above and below a picture, in units; the whole picture takes whole lines of the paper. */
const PAD = 8;

type Corner = 'nw' | 'ne' | 'sw' | 'se';
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

/** Follows one pointer from a press on `e.currentTarget` until it lets go: `onMove` gets how far it went (pixels). */
function follow(
  e: ReactPointerEvent<HTMLElement>,
  onMove: (dx: number, dy: number) => void,
  onEnd: (done: boolean) => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget;
  const x0 = e.clientX;
  const y0 = e.clientY;
  el.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0);
  const end = (done: boolean) => () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    onEnd(done);
  };
  const up = end(true);
  const cancel = end(false);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
}

/** The picture as shown: cropped, then turned, `width` × `height` units. */
function Shown({
  p,
  crop,
  width,
  height,
  onBroken,
}: {
  p: PictureAttrs;
  crop: Rect;
  width: number;
  height: number;
  onBroken: () => void;
}) {
  const t = turned(p.rotate);
  const keptW = t ? height : width;
  const keptH = t ? width : height;
  const iw = keptW / crop.w;
  const ih = keptH / crop.h;
  return (
    <div className="nb-picture__frame" style={{ width, height }}>
      <div
        className="nb-picture__turn"
        style={{ width: keptW, height: keptH, transform: `translate(-50%, -50%) rotate(${p.rotate}deg)` }}
      >
        <img
          src={noteFileHref(p.upload)}
          alt={p.alt}
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={onBroken}
          style={{ width: iw, height: ih, left: -crop.x * iw, top: -crop.y * ih }}
        />
      </div>
    </div>
  );
}

export function PictureView({ node, updateAttributes, deleteNode, editor, selected, getPos }: ReactNodeViewProps) {
  const p = pictureAttrs(node.attrs);
  const editable = editor.isEditable;
  const [size, setSize] = useState<{ width: number; x: number } | null>(null);
  const sizeRef = useRef<{ width: number; x: number } | null>(null);
  const [crop, setCropState] = useState<Rect | null>(null);
  const cropRef = useRef<Rect | null>(null);
  const setCrop = useCallback((next: Rect | null) => {
    cropRef.current = next;
    setCropState(next);
  }, []);
  const [details, setDetails] = useState(false);
  const [broken, setBroken] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const space = usePictureSpace();
  const narrow = useMediaQuery('(max-width: 699px)');

  const width = (size?.width ?? p.width) * TEXT_WIDTH;
  const x = size?.x ?? p.x;
  const cropping = crop !== null;
  // While cropping, the whole picture shows (turned), with the part kept marked on it.
  const ratio = cropping ? shownRatio(p, FULL) : shownRatio(p);
  const height = width / ratio;
  const left = x * (TEXT_WIDTH - width);
  const lines = Math.max(1, Math.ceil((height + 2 * PAD) / LINE));

  const across = useCallback(
    (dxUnits: number) => {
      const startLeft = p.x * (TEXT_WIDTH - p.width * TEXT_WIDTH);
      return { x: placeAt(p.width, (startLeft + dxUnits) / TEXT_WIDTH) };
    },
    [p.x, p.width],
  );
  const { move, onPointerDown: onMoveDown } = useBlockMove({
    editor,
    getPos,
    enabled: editable && !cropping && !broken,
    selected,
    across,
  });
  // A tap (a finger, a pen) selects the picture; so does the keyboard, through the text.
  const select = () => {
    const pos = getPos();
    if (editable && !selected && pos !== undefined)
      editor.chain().setNodeSelection(pos).focus(undefined, { scrollIntoView: false }).run();
  };

  const keepCrop = useCallback(() => {
    const kept = cropRef.current;
    setCrop(null);
    if (kept) updateAttributes(cropAttrs(fromShown(kept, p.rotate)));
    editor.commands.focus();
  }, [setCrop, updateAttributes, p.rotate, editor]);

  // Escape leaves cropping; Enter keeps the crop.
  useEffect(() => {
    if (!cropping) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setCrop(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        keepCrop();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cropping, keepCrop, setCrop]);
  useEffect(() => {
    if (!selected) setCrop(null);
  }, [selected, setCrop]);

  const zoomOf = () => {
    const el = frame.current;
    return el && el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
  };

  const onCorner = (corner: Corner) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const z = zoomOf();
    const fromLeft = corner.endsWith('w');
    const sx = fromLeft ? -1 : 1;
    const sy = corner.startsWith('n') ? -1 : 1;
    const start = { width: p.width, x: p.x };
    follow(
      e,
      (dx, dy) => {
        const across = (dx / z) * sx;
        const down = (dy / z) * sy * ratio;
        const delta = Math.abs(across) >= Math.abs(down) ? across : down;
        const next = resized(start, delta / TEXT_WIDTH, fromLeft);
        sizeRef.current = next;
        setSize(next);
      },
      (done) => {
        const next = sizeRef.current;
        sizeRef.current = null;
        setSize(null);
        if (done && next) updateAttributes(next);
      },
    );
  };

  const onCrop = (edges: Edges) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!crop || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = frame.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const start = crop;
    follow(
      e,
      (dx, dy) => setCrop(dragCrop(start, edges, dx / box.width, dy / box.height)),
      () => undefined,
    );
  };

  // Free: the picture goes on the page where it is now, out of the text (one step to undo).
  const makeFree = () => {
    const pos = getPos();
    const el = frame.current;
    if (!space || pos === undefined || !el) return;
    space.makeFree(pos, p, el.getBoundingClientRect());
  };
  const places = [
    { x: 0, label: 'To the left', icon: TextAlignLeft },
    { x: 0.5, label: 'In the middle', icon: TextAlignCenter },
    { x: 1, label: 'To the right', icon: TextAlignRight },
  ];
  const more: MenuItem[] = [
    ...(narrow
      ? [
          ...places.map((a) => ({
            id: `x${a.x}`,
            label: a.label,
            icon: a.icon,
            hint: p.x === a.x ? 'Now' : undefined,
            onSelect: () => updateAttributes({ x: a.x }),
          })),
          { divider: true as const },
        ]
      : []),
    { id: 'details', label: 'Caption and description', icon: TextT, onSelect: () => setDetails(true) },
    { id: 'open', label: 'Open full size', icon: ArrowSquareOut, href: noteFileHref(p.upload) },
  ];

  const boxStyle: CSSProperties = {
    width,
    marginLeft: left,
    transform: move ? `translate(${move.dx}px, ${move.dy}px)` : undefined,
  };

  return (
    <NodeViewWrapper
      as="figure"
      className={cx('nb-picture', selected && 'is-selected', cropping && 'is-cropping', move && 'is-moving')}
      data-hub="note-picture"
    >
      <div className="nb-picture__space" style={{ height: lines * LINE }}>
        <div className="nb-picture__box" style={boxStyle} contentEditable={false}>
          {broken ? (
            <div className="nb-picture__broken" style={{ height }}>
              <ImageBroken aria-hidden="true" /> This picture isn’t available any more.
            </div>
          ) : (
            <div
              ref={frame}
              className="nb-picture__hold"
              onPointerDown={onMoveDown}
              onClick={select}
              style={{ height }}
            >
              <Shown
                p={p}
                crop={cropping ? FULL : p.crop}
                width={width}
                height={height}
                onBroken={() => setBroken(true)}
              />
              {cropping && crop ? (
                <div className="nb-crop">
                  <div className="nb-crop__clip" aria-hidden="true">
                    <div className="nb-crop__shade" style={rectStyle(crop)} />
                  </div>
                  <div className="nb-crop__rect" style={rectStyle(crop)} onPointerDown={onCrop({})}>
                    {CROP_HANDLES.map((h) => (
                      <span
                        key={h.id}
                        className={cx('nb-crop__handle', `is-${h.id}`)}
                        onPointerDown={onCrop(h.edges)}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {editable && selected && !cropping && !broken && !move
            ? CORNERS.map((c) => (
                <span
                  key={c}
                  className={cx('nb-picture__corner', `is-${c}`)}
                  onPointerDown={onCorner(c)}
                  aria-hidden="true"
                />
              ))
            : null}
          {editable && selected && !move ? (
            cropping ? (
              <BlockBar label="Crop">
                <BlockBarButton icon={Check} label="Done" text onClick={keepCrop} primary />
                <BlockBarButton icon={Crop} label="Whole picture" text onClick={() => setCrop(FULL)} />
                <BlockBarButton icon={X} label="Cancel" onClick={() => setCrop(null)} />
              </BlockBar>
            ) : (
              <BlockBar label="Picture">
                {space ? (
                  <>
                    <PlacementSwitch free={false} onFree={makeFree} />
                    <span className="nb-blockbar__sep" aria-hidden="true" />
                  </>
                ) : null}
                <BlockBarButton
                  icon={Crop}
                  label="Crop"
                  onClick={() => setCrop(toShown(p.crop, p.rotate))}
                  disabled={broken}
                />
                <BlockBarButton
                  icon={ArrowClockwise}
                  label="Turn a quarter"
                  onClick={() => updateAttributes({ rotate: nextTurn(p.rotate) })}
                  disabled={broken}
                />
                {narrow ? null : (
                  <>
                    <span className="nb-blockbar__sep" aria-hidden="true" />
                    {places.map((a) => (
                      <BlockBarButton
                        key={a.x}
                        icon={a.icon}
                        label={a.label}
                        pressed={p.x === a.x}
                        onClick={() => updateAttributes({ x: a.x })}
                      />
                    ))}
                  </>
                )}
                <span className="nb-blockbar__sep" aria-hidden="true" />
                <BarMenu label="More for this picture" items={more} />
                <BlockBarButton icon={Trash} label="Delete picture" danger onClick={deleteNode} />
              </BlockBar>
            )
          ) : null}
        </div>
      </div>
      {p.caption && !cropping ? (
        <figcaption className="nb-picture__caption" style={{ width, marginLeft: left }}>
          {p.caption}
        </figcaption>
      ) : null}
      {move?.line
        ? createPortal(
            <div
              className="nb-dropline"
              style={{ left: move.line.left, top: move.line.top, width: move.line.width }}
              aria-hidden="true"
            />,
            document.body,
          )
        : null}
      {details ? (
        <DetailsDialog
          caption={p.caption}
          alt={p.alt}
          onClose={() => setDetails(false)}
          onSave={(v) => {
            updateAttributes(v);
            setDetails(false);
          }}
        />
      ) : null}
    </NodeViewWrapper>
  );
}
