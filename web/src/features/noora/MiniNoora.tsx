// Mini Noora, the Hub's floating study helper: a mascot you can pick up and put anywhere, and a chat
// that opens when you click her. This file holds her state and puts the parts together:
//   Mascot     the draggable sprite (Mascot.tsx)
//   ChatPanel  the chat and its scripted "brain" (ChatPanel.tsx), fetched on demand so that the
//              shell, which is on every page, only carries the mascot
// She remembers three things in localStorage: hub.noora.pos (where she was put), hub.noora.seen (the first-visit
// hint has done its job) and hub.noora.hidden (hidden from her chat, or by the screenshot tooling: visibility.ts).
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { BREAKPOINTS, useLocalStorage, useMediaQuery, useToast, useYear } from '../../state';
import { ErrorBoundary } from '../../ui';
import { Mascot, type MascotState } from './Mascot';
import { clampPoint, fromAnchor, homePoint, perchOnSheet, placeChat, toAnchor, type Anchor, type Point, type Side } from './layout';
import { choosePose, heading, lean, type ChatMood, type Heading } from './poses';
import { HEIGHT, figure, preloadSprites } from './sprites';
import { useDrag } from './useDrag';
import { useViewport } from './useViewport';
import { hideMiniNoora, showMiniNoora, useMiniNooraHidden } from './visibility';

const loadChat = () => import('./ChatPanel');
const ChatPanel = lazy(loadChat);

const POS_KEY = 'hub.noora.pos';
const SEEN_KEY = 'hub.noora.seen';

const WALK_FRAME = 125; // ms per frame: carried sideways, she walks at 8 frames a second
const LANDING = 900; // ms she looks pleased after being put down
const HINT_DELAY = 1400; // ms before the first-visit hint speaks up
const HINT_STAYS = 12_000; // ms it stays before it has done its job (it never covers a form for long: UX-17)
const NUDGE: Partial<Record<string, [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

interface Carried {
  point: Point;
  tilt: number;
  dir: Heading;
  moving: boolean;
}

// The year prompt or the tour (onboarding announces both on <html data-onboarding>: 'prompt' or 'open').
const onboardingIsUp = (): boolean => document.documentElement.dataset.onboarding != null;

/** true while onboarding's prompt or tour is up: her first-visit hint waits, and on a phone she does too. */
function useOnboardingOpen(): boolean {
  const [up, setUp] = useState(onboardingIsUp);
  useEffect(() => {
    const on = () => setUp(onboardingIsUp());
    on();
    window.addEventListener('hub:onboarding', on);
    return () => window.removeEventListener('hub:onboarding', on);
  }, []);
  return up;
}

/** Mounted once by the shell. Renders nothing at all while she is hidden, or on a phone while the year prompt
 *  takes the bottom of the screen. */
export function MiniNoora() {
  const hidden = useMiniNooraHidden();
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const onboarding = useOnboardingOpen();
  return hidden || (phone && onboarding) ? null : <Noora />;
}

function Noora() {
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const onboarding = useOnboardingOpen();
  const { year } = useYear();
  const chatId = useId();
  const ruler = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const view = useViewport(ruler);
  const size = useMemo(() => figure(phone ? HEIGHT.phone : HEIGHT.desktop), [phone]);

  // Stored JSON is not trusted: fromAnchor() checks the anchor, and `seen` counts only when it is true.
  const [anchor, setAnchor] = useLocalStorage<Anchor | null>(POS_KEY, null);
  const [seenStored, setSeen] = useLocalStorage<unknown>(SEEN_KEY, false);
  const seen = seenStored === true;
  const [open, setOpen] = useState(false);
  const [chatWanted, setChatWanted] = useState(false); // opened at least once: keep it, and the conversation, around
  const [chatPose, setChatPose] = useState<ChatMood | null>(null); // how the chat wants her to stand
  const [carry, setCarry] = useState<Carried | null>(null); // while she is dragged
  const [step, setStep] = useState<0 | 1>(0); // walk-cycle frame
  const [pressed, setPressed] = useState(false);
  const [landed, setLanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hintDue, setHintDue] = useState(false);

  // ── Where she is ────────────────────────────────────────────────────────────────────────────────
  // Where she was last put (or her corner), unless a hand is carrying her.
  const home = useMemo(() => fromAnchor(anchor, view, size) ?? homePoint(view, size, phone), [anchor, view, size, phone]);
  const free = carry ? carry.point : home;
  // The chat goes beside her and follows her. While it is open it stays on the side it is on for as long as it fits.
  const chatSide = useRef<Side | null>(null);
  const place = useMemo(() => placeChat(free, view, size, { phone, prefer: chatSide.current }), [free, view, size, phone]);
  useEffect(() => {
    chatSide.current = open ? place.side : null;
  }, [open, place]);
  // On a phone the chat is a sheet over the bottom of the screen, so she hops onto its top edge.
  const perched = open && place.sheet;
  const point = perched ? perchOnSheet(place, view, size) : free;

  // ── Picking her up ──────────────────────────────────────────────────────────────────────────────
  const at = useRef(point); // her position right now, for the handlers below
  const handMoved = useRef(false); // the hand has moved since the last walk frame
  useEffect(() => {
    at.current = point;
  });

  const markSeen = () => {
    if (!seen) setSeen(true);
  };

  const drag = useDrag({
    enabled: !perched,
    getPoint: () => at.current,
    onPress: () => setPressed(true),
    onStart: ({ dx, dy }) => {
      markSeen();
      setLanded(false);
      handMoved.current = true;
      setCarry({ point: at.current, tilt: 0, dir: heading(dx, dy), moving: true });
    },
    onMove: ({ x, y, vx, vy }) => {
      const next = clampPoint({ x, y }, view, size);
      at.current = next;
      handMoved.current = true;
      setCarry((c) => c && { point: next, tilt: calm ? 0 : lean(vx), dir: heading(vx, vy, c.dir), moving: true });
    },
    onEnd: ({ dragged }) => {
      setPressed(false);
      if (!dragged) return;
      setAnchor(toAnchor(at.current, view, size));
      setCarry(null);
      setLanded(true);
    },
  });

  // While she is carried: step the walk cycle, and notice when the hand stops.
  const carried = Boolean(carry);
  useEffect(() => {
    if (!carried) return undefined;
    const frame = setInterval(() => {
      const moving = handMoved.current;
      handMoved.current = false;
      setCarry((c) => (c && c.moving !== moving ? { ...c, moving, tilt: moving ? c.tilt : 0 } : c));
      if (moving) setStep((s) => (s ? 0 : 1));
    }, WALK_FRAME);
    return () => clearInterval(frame);
  }, [carried]);

  useEffect(() => {
    if (!landed) return undefined;
    const done = setTimeout(() => setLanded(false), LANDING);
    return () => clearTimeout(done);
  }, [landed]);

  // ── The chat ────────────────────────────────────────────────────────────────────────────────────
  const openChat = () => {
    markSeen();
    setChatWanted(true);
    setOpen(true);
  };
  // Closing from inside the chat (Esc, its close button) hands the keyboard back to her.
  const closeChat = useCallback(() => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  }, []);
  // Hidden from her chat: she goes at once, and the toast (or the palette, later) brings her back.
  const { push } = useToast();
  const hide = useCallback(() => {
    hideMiniNoora();
    push({ title: 'Mini Noora is hidden', body: 'Bring her back from search: type “Noora”.', action: { label: 'Undo', onClick: showMiniNoora }, duration: 8000 });
  }, [push]);

  useEffect(() => {
    preloadSprites();
    // Fetch the chat's code once the page has settled, so that her first click opens it at once.
    const warm = () => {
      loadChat().catch(() => {});
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 800);
    return () => window.clearTimeout(id);
  }, []);

  // ── The first-visit hint ────────────────────────────────────────────────────────────────────────
  // Only on Home, where nothing it could cover is being filled in, and only for a while (UX review UX-17).
  const onHome = useLocation().pathname === '/';
  useEffect(() => {
    if (seen || onboarding || !onHome) return undefined;
    const due = setTimeout(() => setHintDue(true), HINT_DELAY);
    return () => clearTimeout(due);
  }, [seen, onboarding, onHome]);
  const hintSide = point.x + size.w / 2 > view.w / 2 ? 'left' : 'right';
  const hint = hintDue && onHome && !seen && !onboarding && !open && !carried ? hintSide : null;
  const hinting = hint !== null;
  useEffect(() => {
    if (!hinting) return undefined;
    const done = setTimeout(() => setSeen(true), HINT_STAYS);
    return () => clearTimeout(done);
  }, [hinting, setSeen]);

  // Closed from its button: done for good. Focus goes to her, not to the top of the page, when it was on the bubble.
  const closeHint = () => {
    const hadFocus = document.activeElement instanceof Element && document.activeElement.closest('.noora__hint') !== null;
    setSeen(true);
    if (hadFocus) button.current?.focus();
  };

  // ── Events on her ───────────────────────────────────────────────────────────────────────────────
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (drag.followsDrag(e)) return; // that click was the end of a drag
    if (open) setOpen(false);
    else openChat();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    // Arrow keys nudge her (Shift: further).
    const dir = NUDGE[e.key];
    if (!dir || perched || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    markSeen();
    const by = e.shiftKey ? 64 : 16;
    setAnchor(toAnchor(clampPoint({ x: home.x + dir[0] * by, y: home.y + dir[1] * by }, view, size), view, size));
  };

  const pose = choosePose({ carry, step: calm ? 0 : step, pressed, dropped: landed, chat: open ? chatPose : null, lively: hovered || focused });
  const state: MascotState = carried ? 'carried' : pressed ? 'pressed' : landed ? 'dropped' : 'rest';

  return createPortal(
    <>
      <span ref={ruler} className="noora-ruler" aria-hidden="true" />
      {chatWanted ? (
        // If the chat ever fails, she stays; opening it again gives it another go.
        <ErrorBoundary name="MiniNoora chat" fallback={null} resetKey={open}>
          <Suspense fallback={null}>
            <ChatPanel id={chatId} open={open} place={place} year={year} calm={calm} onClose={closeChat} onHide={hide} onPose={setChatPose} />
          </Suspense>
        </ErrorBoundary>
      ) : null}
      <Mascot
        ref={button}
        point={point}
        size={size}
        pose={pose}
        // 'talking' gestures to her left (our right): turn her round when the chat is on her other side.
        mirrored={pose === 'talking' && place.side === 'left'}
        state={state}
        tilt={carry ? carry.tilt : 0}
        open={open}
        chatId={open ? chatId : undefined}
        hint={hint}
        onHintClick={openChat}
        onHintClose={closeHint}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerEnter={(e: PointerEvent<HTMLButtonElement>) => setHovered(e.pointerType !== 'touch')}
        onPointerLeave={() => setHovered(false)}
        onFocus={(e: FocusEvent<HTMLButtonElement>) => setFocused(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        {...drag.handlers}
      />
    </>,
    document.body,
  );
}
