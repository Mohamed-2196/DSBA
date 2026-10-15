import { useState } from 'react';
import type { CareerLogo } from '../../api/types';
import { cx } from '../../ui';
import { logoSrc, type LogoKind } from './lib/logos';
import './LogoSlot.css';

type LogoState = 'loading' | 'ok' | 'missing';

// What each file did the last time it was asked for, so a card that re-mounts (a filter change) paints its final
// state at once instead of blinking through "loading".
const seen = new Map<string, LogoState>();

export interface LogoSlotProps {
  kind?: LogoKind;
  /** Data id, which is also the bundled file's name. */
  id: string;
  /** The logo an editor uploaded; without one, the bundled file. */
  logo?: CareerLogo | null;
  /** One to four characters for the fallback tile. */
  mono?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A slot for an official logo: the one an editor uploaded with the organisation's permission, else a bundled file
 * (public/logos/employers/<id>.png or public/logos/certs/<id>.png).
 * The image sits on a white rounded tile (contain, padded, a fixed box) so marks of any shape line up across a grid.
 * Until the file exists the slot shows a neutral monogram tile: the organisation's initials in the app's own type and
 * palette. Nothing here draws, traces or colours a brand mark.
 * Decorative: the organisation's name is always printed next to the slot.
 */
export function LogoSlot({ kind = 'employer', id, logo, mono = '', size = 'md', className }: LogoSlotProps) {
  const src = logoSrc(kind, id, logo);
  const [state, setState] = useState<LogoState>(() => seen.get(src) ?? 'loading');
  const settle = (next: LogoState) => {
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
