import { useState } from 'react';
import { cx } from '../../ui';
import { logoUrl } from './lib/logos';
import './LogoSlot.css';

// What each file did the last time it was asked for, so a card that re-mounts (a filter change) paints its final
// state at once instead of blinking through "loading".
const seen = new Map();

/**
 * A slot for an official logo, supplied as a file: public/logos/employers/<id>.png or public/logos/certs/<id>.png.
 * The image sits on a white rounded tile (contain, padded, a fixed 176 × 80 box) so marks of any shape line up
 * across a grid.
 * Until the file exists the slot shows a neutral monogram tile: the organisation's initials in the app's own type
 * and palette. Nothing here draws, traces or colours a brand mark.
 *
 * Decorative: the organisation's name is always printed next to the slot.
 * @param {'employer'|'cert'} kind
 * @param {string} id     data id, which is also the file name
 * @param {string} mono   one to four characters for the fallback tile
 * @param {'sm'|'md'} size
 */
export function LogoSlot({ kind = 'employer', id, mono = '', size = 'md', className }) {
  const src = logoUrl(kind, id);
  const [state, setState] = useState(() => seen.get(src) || 'loading');
  const settle = (next) => {
    seen.set(src, next);
    setState(next);
  };
  return (
    <span className={cx('career-logo', `career-logo--${size}`, `is-${state}`, className)} data-hub="career-logo" data-logo-state={state} aria-hidden="true">
      {state === 'missing' ? (
        <span className="career-logo__mono" data-length={Math.min(mono.length, 4)}>
          {mono}
        </span>
      ) : (
        <img className="career-logo__img" src={src} alt="" decoding="async" draggable="false" onLoad={() => settle('ok')} onError={() => settle('missing')} />
      )}
    </span>
  );
}
