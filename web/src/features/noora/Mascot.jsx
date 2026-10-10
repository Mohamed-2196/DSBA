import { forwardRef, useState } from 'react';
import { POSES, poseUrl } from './sprites';
import './Mascot.css';

const LABEL = 'Mini Noora, your study helper. Press to chat, drag to move.';
const HINT = 'Hi! I’m Mini Noora. Ask me anything about your modules.';

/**
 * Mini Noora herself: a button that shows one full-body sprite. It only draws; where she is and
 * which pose she is in are decided by MiniNoora.jsx.
 *
 * @param point     { x, y } top-left of her box, in the window
 * @param size      from figure(): her box and where the sprite canvas sits around it
 * @param pose      the sprite to show (one of POSES)
 * @param mirrored  flip the sprite left to right (so 'talking' points at a chat on her left)
 * @param {'rest'|'pressed'|'carried'|'dropped'} state  drives the CSS: breathing, lift, squash-and-settle
 * @param tilt      degrees she leans while carried
 * @param open      the chat is open (aria-expanded); chatId is the chat's element id
 * @param hint      show the first-visit speech bubble, on this side of her ('left' | 'right'), or null
 * Every other prop (pointer, key and focus handlers) goes on the button.
 */
export const Mascot = forwardRef(function Mascot({ point, size, pose, mirrored, state, tilt, open, chatId, hint, onHintClick, ...handlers }, ref) {
  // A pose is shown only once its image has arrived, so she never blinks out while one is still loading.
  const [arrived, setArrived] = useState(() => new Set());
  const shown = arrived.has(pose) ? pose : 'idle';
  const { canvas } = size;

  return (
    <div
      className="noora"
      data-state={state}
      data-ready={arrived.has('idle') ? '' : undefined}
      style={{
        width: size.w,
        height: size.h,
        transform: `translate3d(${point.x}px, ${point.y}px, 0)`,
        '--noora-tilt': `${tilt}deg`,
        '--noora-cw': `${canvas.width}px`,
        '--noora-ch': `${canvas.height}px`,
        '--noora-cx': `${canvas.left}px`,
        '--noora-cy': `${canvas.top}px`,
      }}
    >
      {hint ? (
        <button type="button" className="noora__hint" data-side={hint} onClick={onHintClick}>
          {HINT}
        </button>
      ) : null}
      <button
        ref={ref}
        type="button"
        className="noora__button"
        aria-label={LABEL}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={chatId}
        data-hub="noora"
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
