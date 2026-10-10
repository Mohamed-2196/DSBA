import { useState } from 'react';
import { cx } from '../../ui';
import { BUSTS, bustUrl, faceCrop, type Bust } from './sprites';

export interface FaceProps {
  /** which portrait */
  bust?: Bust;
  /** diameter in px */
  size?: number;
  /**
   * keep every portrait in the frame, so a change of expression shows at once (the chat header does this; the
   * small faces beside her messages never change)
   */
  live?: boolean;
  className?: string;
}

/** Her face in a round frame, cut from a bust sprite. */
export function Face({ bust = 'neutral', size = 28, live = false, className }: FaceProps) {
  // As with her body: an expression is shown only once its image has arrived.
  const [arrived, setArrived] = useState<ReadonlySet<Bust>>(() => new Set());
  const shown = !live || arrived.has(bust) ? bust : 'neutral';
  const names: readonly Bust[] = live ? BUSTS : [bust];
  return (
    <span className={cx('nc-face', className)} style={{ width: size, height: size }} aria-hidden="true">
      {names.map((name) => (
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
