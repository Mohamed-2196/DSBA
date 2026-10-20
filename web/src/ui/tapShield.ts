// A dialog or sheet that closes on a tap leaves the page under the finger. On a touch screen a quick second tap (a
// double tap on "Start") would then land on whatever sits there, often the tab bar. For a moment after an overlay
// closes, a clear layer over the page takes those taps and does nothing with them.

/** How long the page ignores taps after an overlay closes on a touch screen (ms). */
export const TAP_SHIELD_MS = 350;

/** What the shield needs from the page: enough to test it without a browser. */
export interface ShieldHost<E extends ShieldElement = ShieldElement> {
  createElement: (tag: 'div') => E;
  body: { appendChild: (el: E) => unknown };
  /** true on a touch screen, where a stray tap lands */
  coarse: () => boolean;
  setTimeout: (fn: () => void, ms: number) => unknown;
}

export interface ShieldElement {
  className: string;
  setAttribute: (name: string, value: string) => void;
  addEventListener: (
    type: string,
    fn: (e: { preventDefault: () => void; stopPropagation: () => void }) => void,
  ) => void;
  remove: () => void;
}

const SWALLOW = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'] as const;

function browserHost(): ShieldHost<HTMLDivElement> | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  return {
    createElement: (tag) => document.createElement(tag),
    body: document.body,
    coarse: () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  };
}

/**
 * Cover the page for `ms` so a tap that follows an overlay's closing tap does nothing. Only on touch screens: a mouse
 * double click has no such slip. Returns the layer (null when none was needed).
 */
export function shieldStrayTaps<E extends ShieldElement>(host: ShieldHost<E> | null, ms = TAP_SHIELD_MS): E | null {
  if (!host || !host.coarse()) return null;
  const el = host.createElement('div');
  el.className = 'ui-tap-shield';
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('data-hub', 'tap-shield');
  for (const type of SWALLOW)
    el.addEventListener(type, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  host.body.appendChild(el);
  host.setTimeout(() => el.remove(), ms);
  return el;
}

/** The same, on this page. */
export const shieldPageTaps = (): void => void shieldStrayTaps(browserHost());
