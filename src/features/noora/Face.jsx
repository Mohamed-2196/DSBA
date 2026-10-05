import { useState } from 'react';
import { cx } from '../../ui';
import { BUSTS, bustUrl, faceCrop } from './sprites.js';

/**
 * Her face in a round frame, cut from a bust sprite.
 * @param bust   which portrait: 'wave' | 'neutral' | 'thinking' | 'winking' | 'laughing' | 'angry'
 * @param size   diameter in px
 * @param live   keep every portrait in the frame, so a change of expression shows at once (the chat
 *               header does this; the small faces beside her messages never change)
 */
export function Face({ bust = 'neutral', size = 28, live = false, className }) {
  // As with her body: an expression is shown only once its image has arrived.
  const [arrived, setArrived] = useState(() => new Set());
  const shown = !live || arrived.has(bust) ? bust : 'neutral';
  return (
    <span className={cx('nc-face', className)} style={{ width: size, height: size }} aria-hidden="true">
      {(live ? BUSTS : [bust]).map((name) => (
        <img
          key={name}
          className="nc-face__img"
          src={bustUrl(name)}
          alt=""
          draggable={false}
          decoding="sync"
          style={faceCrop(name)}
          data-on={name === shown ? '' : undefined}
          onLoad={live ? () => setArrived((set) => (set.has(name) ? set : new Set(set).add(name))) : undefined}
        />
      ))}
    </span>
  );
}
