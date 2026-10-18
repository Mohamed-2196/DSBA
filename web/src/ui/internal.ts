// Internal helpers shared by the primitives. Feature code may import `cx` from 'src/ui'.
import {
  cloneElement,
  createElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefCallback,
  type RefObject,
} from 'react';
import type { IconProps } from '@phosphor-icons/react';

/** An icon: a Phosphor component (`Plus`) or an element (`<Plus weight="bold" />`, `<span className="dot" />`). */
export type IconSource = ComponentType<IconProps> | ReactElement;

type ClassValue = string | false | null | undefined | 0;

/** Join class names, skipping falsy values. */
export function cx(...args: ClassValue[]): string {
  return args.filter(Boolean).join(' ');
}

interface IconRenderProps {
  className?: string;
  weight?: IconProps['weight'];
}

type ElementProps = { className?: string } & Record<string, unknown>;

/** Render an icon given as a component (Phosphor `Plus`) or an element (`<Plus weight="bold" />`). */
export function renderIcon(
  icon: IconSource | null | undefined | false,
  { className, ...props }: IconRenderProps = {},
): ReactNode {
  if (!icon) return null;
  if (isValidElement<ElementProps>(icon)) {
    return cloneElement(icon, { 'aria-hidden': true, ...props, className: cx(icon.props.className, className) });
  }
  return createElement(icon as ComponentType<IconProps>, { 'aria-hidden': true, className, ...props });
}

/** Assign one value to many refs. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    for (const r of refs) {
      if (typeof r === 'function') r(node);
      else if (r) (r as MutableRefObject<T | null>).current = node;
    }
  };
}

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0 && !el.closest('[inert]'),
  );
}

// ── Scroll lock (ref-counted so nested overlays work) ──────────────────────
let lockCount = 0;
let saved: { overflow: string; paddingRight: string } | null = null;
function lockScroll() {
  if (lockCount++ > 0) return;
  const sbw = window.innerWidth - document.documentElement.clientWidth;
  saved = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight };
  document.body.style.overflow = 'hidden';
  if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
}
function unlockScroll() {
  if (--lockCount > 0 || !saved) return;
  document.body.style.overflow = saved.overflow;
  document.body.style.paddingRight = saved.paddingRight;
  saved = null;
}

// ── Layer stack: only the top-most overlay/menu reacts to Esc and traps Tab ──────────────
export interface Layer {
  /** the overlay's panel: focus goes there when an overlay on top of it closes without an opener to return to */
  panel?: RefObject<HTMLElement>;
}
const layers: Layer[] = [];
const isTopLayer = (layer: Layer | null): boolean => !!layer && layers[layers.length - 1] === layer;

export function useLayer(
  open: boolean,
  onEscape?: (e: KeyboardEvent) => void,
  panelRef?: RefObject<HTMLElement>,
): RefObject<Layer | null> {
  const escRef = useRef(onEscape);
  const layerRef = useRef<Layer | null>(null);
  useEffect(() => {
    escRef.current = onEscape;
  });
  useEffect(() => {
    if (!open) return undefined;
    const token: Layer = { panel: panelRef };
    layers.push(token);
    layerRef.current = token;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isTopLayer(token)) return;
      e.preventDefault();
      escRef.current?.(e);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = layers.indexOf(token);
      if (i >= 0) layers.splice(i, 1);
      layerRef.current = null;
    };
    // panelRef is a ref object: stable for the overlay's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return layerRef;
}

function canTakeFocus(el: Element | null): el is HTMLElement | SVGElement {
  return (
    !!el &&
    typeof (el as HTMLElement).focus === 'function' &&
    document.contains(el) &&
    el.getClientRects().length > 0 &&
    !el.matches(':disabled') &&
    !el.closest('[inert]')
  );
}

/**
 * Where focus goes when an overlay closes: back to what opened it; when that is gone or can't take focus (Sign in
 * became the account button, a busy button is disabled), the overlay underneath, then the account button, then the
 * main content, never <body> (UX review UX-9).
 */
function restoreFocus(opener: Element | null): void {
  if (canTakeFocus(opener)) {
    opener.focus({ preventScroll: true });
    if (document.activeElement === opener) return;
  }
  const below = layers[layers.length - 1]?.panel?.current ?? null;
  const profile = [...document.querySelectorAll('[data-hub="profile"]')].find(canTakeFocus) ?? null;
  const target = [below, profile, document.getElementById('main')].find(canTakeFocus);
  target?.focus({ preventScroll: true });
}

interface OverlayOptions {
  open: boolean;
  onClose?: () => void;
  panelRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
  lock?: boolean;
}

/**
 * Modal/drawer behaviour: Esc closes, Tab is trapped, body scroll locked,
 * focus moves in on open and returns to the opener on close.
 * Initial focus: initialFocusRef, else an element with [data-autofocus], else the dialog itself
 * (so no focus ring lands on the close button when a dialog opens on page load; Tab reaches the controls).
 */
export function useOverlay({ open, onClose, panelRef, initialFocusRef, lock = true }: OverlayOptions): void {
  const layer = useLayer(open, () => onClose?.(), panelRef);
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const panelAtOpen = panelRef.current;
    if (lock) lockScroll();
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target = initialFocusRef?.current || panel.querySelector<HTMLElement>('[data-autofocus]') || panel;
      target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most overlay keeps Tab inside itself: one opened on top of another owns the keyboard.
      if (e.key !== 'Tab' || !isTopLayer(layer.current)) return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = getFocusable(panel);
      if (!items.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (lock) unlockScroll();
      // Leave focus alone if the closing action already moved it somewhere on purpose.
      const active = document.activeElement;
      if (active && active !== document.body && panelAtOpen && !panelAtOpen.contains(active)) return;
      restoreFocus(opener);
    };
  }, [open, lock, panelRef, initialFocusRef, layer]);
}

/** Keep something mounted for `duration` ms after it closes so it can animate out. */
export function usePresence(open: boolean, duration = 180): { mounted: boolean; state: 'open' | 'closing' } {
  const [rendered, setRendered] = useState(open);
  useEffect(() => {
    if (open) {
      setRendered(true);
      return undefined;
    }
    const t = setTimeout(() => setRendered(false), duration);
    return () => clearTimeout(t);
  }, [open, duration]);
  return { mounted: open || rendered, state: open ? 'open' : 'closing' };
}

export type FloatSide = 'top' | 'bottom' | 'left' | 'right';
export type FloatAlign = 'start' | 'end' | 'center';
export type FloatPlacement = FloatSide | `${FloatSide}-${'start' | 'end'}`;
export interface FloatPosition {
  top: number;
  left: number;
  side: FloatSide;
}

/**
 * Position a fixed floating element next to a trigger. placement: 'bottom-start' | 'bottom-end' |
 * 'bottom' | 'top-*' | 'right-*' | 'left-*'. Flips when out of room, clamps to the viewport.
 */
export function useFloating(
  open: boolean,
  triggerRef: RefObject<HTMLElement>,
  floatRef: RefObject<HTMLElement>,
  { placement = 'bottom-start', offset = 8 }: { placement?: FloatPlacement; offset?: number } = {},
): FloatPosition | null {
  const [pos, setPos] = useState<FloatPosition | null>(null);
  const update = useCallback(() => {
    const t = triggerRef.current;
    const f = floatRef.current;
    if (!t || !f) return;
    const r = t.getBoundingClientRect();
    const fw = f.offsetWidth;
    const fh = f.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 8;
    const [first, second] = placement.split('-') as [FloatSide, FloatAlign | undefined];
    let side = first;
    const align: FloatAlign = second ?? 'center';
    if (side === 'bottom' && r.bottom + offset + fh > vh - m && r.top - offset - fh > m) side = 'top';
    else if (side === 'top' && r.top - offset - fh < m && r.bottom + offset + fh < vh - m) side = 'bottom';
    else if (side === 'right' && r.right + offset + fw > vw - m) side = 'left';
    else if (side === 'left' && r.left - offset - fw < m) side = 'right';
    let top: number;
    let left: number;
    if (side === 'bottom' || side === 'top') {
      top = side === 'bottom' ? r.bottom + offset : r.top - offset - fh;
      left = align === 'start' ? r.left : align === 'end' ? r.right - fw : r.left + r.width / 2 - fw / 2;
    } else {
      left = side === 'right' ? r.right + offset : r.left - offset - fw;
      top = align === 'start' ? r.top : align === 'end' ? r.bottom - fh : r.top + r.height / 2 - fh / 2;
    }
    left = Math.max(m, Math.min(left, vw - fw - m));
    top = Math.max(m, Math.min(top, vh - fh - m));
    setPos({ top: Math.round(top), left: Math.round(left), side });
  }, [placement, offset, triggerRef, floatRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, update]);

  return pos;
}
