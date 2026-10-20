import { forwardRef, useState, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { IconButton, modKeyLabel, Icon, glyph } from '../../ui';
import type { Point, Side } from './layout';
import { POSES, poseUrl, type Figure, type Pose } from './sprites';
import './Mascot.css';

const HINT = 'Hi, I’m Noora. Ask me anything you’re studying, from a formula to a revision plan.';

export type MascotState = 'rest' | 'pressed' | 'carried' | 'dropped';
export type Motion = 'breathe' | 'wave' | 'think';

export interface MascotProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** top-left of her box, in the window */
  point: Point;
  /** from figure(): her box and where the sprite canvas sits around it */
  size: Figure;
  /** the sprite to show */
  pose: Pose;
  /** flip the sprite left to right (so a wave or a gesture points at the chat) */
  mirrored: boolean;
  /** drives the CSS: lift, squash-and-settle */
  state: MascotState;
  /** the motion at rest */
  motion: Motion;
  /** degrees she leans while carried */
  tilt: number;
  /** the chat is open (aria-expanded) */
  open: boolean;
  /** the chat's element id */
  chatId: string;
  /** show the first-visit speech bubble, on this side of her */
  hint: Side | null;
  /** the bubble's words were pressed: open the chat */
  onHintClick: () => void;
  /** the bubble's close button: it has done its job */
  onHintClose: () => void;
}

/**
 * Mini Noora herself: a button that shows one full-body sprite. It only draws; where she is and which pose she is
 * in are decided by MiniNoora.tsx. Every other prop (pointer, key and focus handlers) goes on the button.
 */
export const Mascot = forwardRef<HTMLButtonElement, MascotProps>(function Mascot(
  { point, size, pose, mirrored, state, motion, tilt, open, chatId, hint, onHintClick, onHintClose, ...handlers },
  ref,
) {
  // A pose is shown only once its image has arrived, so she never blinks out while one is still loading.
  const [arrived, setArrived] = useState<ReadonlySet<Pose>>(() => new Set());
  const shown: Pose = arrived.has(pose) ? pose : 'idle';
  const { canvas } = size;
  const shortcut = modKeyLabel() === '⌘' ? '⌘/' : 'Ctrl+/';

  return (
    <div
      className="noora"
      data-state={state}
      data-motion={motion}
      data-open={open ? '' : undefined}
      data-ready={arrived.has('idle') ? '' : undefined}
      style={
        {
          width: size.w,
          height: size.h,
          transform: `translate3d(${point.x}px, ${point.y}px, 0)`,
          '--noora-tilt': `${tilt}deg`,
          '--noora-cw': `${canvas.width}px`,
          '--noora-ch': `${canvas.height}px`,
          '--noora-cx': `${canvas.left}px`,
          '--noora-cy': `${canvas.top}px`,
        } as CSSProperties
      }
    >
      {hint ? (
        <div className="noora__hint" data-side={hint} data-hub="noora-hint">
          <button type="button" className="noora__hint-text" onClick={onHintClick}>
            {HINT}
          </button>
          <IconButton
            size="sm"
            icon={<Icon glyph={glyph.close} />}
            label="Close the hint"
            onClick={onHintClose}
            className="noora__hint-close"
          />
        </div>
      ) : null}
      <button
        ref={ref}
        type="button"
        className="noora__button"
        aria-label={open ? 'Mini Noora: close the chat' : `Mini Noora: ask a question (${shortcut}). Drag to move her.`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={chatId}
        aria-keyshortcuts="Meta+/ Control+/"
        data-hub="noora-launcher"
        data-pose={shown}
        {...handlers}
      >
        <span className="noora__ground" aria-hidden="true" />
        <span className="noora__lift">
          <span className="noora__figure" data-mirrored={mirrored ? '' : undefined}>
            {POSES.map((name) => (
              <img
                key={name}
                className="noora__pose"
                src={poseUrl(name)}
                alt=""
                draggable={false}
                decoding="sync"
                data-on={name === shown ? '' : undefined}
                onLoad={() => setArrived((set) => (set.has(name) ? set : new Set(set).add(name)))}
              />
            ))}
          </span>
        </span>
      </button>
    </div>
  );
});
