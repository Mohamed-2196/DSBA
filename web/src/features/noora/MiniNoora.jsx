// Mini Noora, the Hub's floating study helper: a mascot you can pick up and put anywhere, and a chat
// that opens when you click her. This file holds her state and puts the parts together:
//   Mascot     the draggable sprite (Mascot.jsx)
//   ChatPanel  the chat and its scripted "brain" (ChatPanel.jsx), fetched on demand so that the
//              shell, which is on every page, only carries the mascot
// She remembers two things in localStorage: hub.noora.pos (where she was put) and hub.noora.seen
// (the first-visit hint has done its job). The screenshot tooling hides her with hub.noora.hidden = '1'.
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BREAKPOINTS, useLocalStorage, useMediaQuery, useYear } from '../../state';
import { ErrorBoundary } from '../../ui';
import { Mascot } from './Mascot';
import { clampPoint, fromAnchor, homePoint, perchOnSheet, placeChat, toAnchor } from './layout';
import { choosePose, heading, lean } from './poses';
import { HEIGHT, figure, preloadSprites } from './sprites';
import { useDrag } from './useDrag';
import { useViewport } from './useViewport';

const loadChat = () => import('./ChatPanel');
const ChatPanel = lazy(loadChat);

const POS_KEY = 'hub.noora.pos';
const SEEN_KEY = 'hub.noora.seen';
const HIDDEN_KEY = 'hub.noora.hidden';

const WALK_FRAME = 125; // ms per frame: carried sideways, she walks at 8 frames a second
const LANDING = 900; // ms she looks pleased after being put down
const HINT_DELAY = 1400; // ms before the first-visit hint speaks up
const NUDGE = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function isHidden() {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

const onboardingIsUp = () => document.documentElement.dataset.onboarding === 'open';

/** true while the onboarding dialog is up (it announces itself on <html data-onboarding>). */
function useOnboardingOpen() {
  const [up, setUp] = useState(onboardingIsUp);
  useEffect(() => {
    const on = () => setUp(onboardingIsUp());
    on();
    window.addEventListener('hub:onboarding', on);
    return () => window.removeEventListener('hub:onboarding', on);
  }, []);
  return up;
}

/** Mounted once by the shell. Renders nothing at all when the screenshot tooling has hidden her. */
export function MiniNoora() {
  const [hidden] = useState(isHidden);
  return hidden ? null : <Noora />;
}

function Noora() {
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const onboarding = useOnboardingOpen();
  const { year } = useYear();
  const chatId = useId();
  const ruler = useRef(null);
  const button = useRef(null);
  const view = useViewport(ruler);
  const size = useMemo(() => figure(phone ? HEIGHT.phone : HEIGHT.desktop), [phone]);

  const [anchor, setAnchor] = useLocalStorage(POS_KEY, null);
  const [seen, setSeen] = useLocalStorage(SEEN_KEY, false);
  const [open, setOpen] = useState(false);
  const [chatWanted, setChatWanted] = useState(false); // opened at least once: keep it, and the conversation, around
  const [chatPose, setChatPose] = useState(null); // how the chat wants her to stand: 'talking' | 'happy' | 'sad' | null
  const [carry, setCarry] = useState(null); // while she is dragged: { point, tilt, dir, moving }
  const [step, setStep] = useState(0); // walk-cycle frame
  const [pressed, setPressed] = useState(false);
  const [landed, setLanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hintDue, setHintDue] = useState(false);

  // ── Where she is ────────────────────────────────────────────────────────────────────────────────
  // Where she was last put (or her corner), unless a hand is carrying her.
  const home = useMemo(() => fromAnchor(anchor, view, size) || homePoint(view, size, phone), [anchor, view, size, phone]);
  const free = carry ? carry.point : home;
  // The chat goes beside her and follows her. While it is open it stays on the side it is on for as long as it fits.
  const chatSide = useRef(null);
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
      if (moving) setStep((s) => 1 - s);
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

  useEffect(() => {
    preloadSprites();
    // Fetch the chat's code once the page has settled, so that her first click opens it at once.
    const warm = () => loadChat().catch(() => {});
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 800);
    return () => window.clearTimeout(id);
  }, []);

  // ── The first-visit hint ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (seen || onboarding) return undefined;
    const due = setTimeout(() => setHintDue(true), HINT_DELAY);
    return () => clearTimeout(due);
  }, [seen, onboarding]);
  const hintSide = point.x + size.w / 2 > view.w / 2 ? 'left' : 'right';
  const hint = hintDue && !seen && !onboarding && !open && !carried ? hintSide : null;

  // ── Events on her ───────────────────────────────────────────────────────────────────────────────
  const onClick = (e) => {
    if (drag.followsDrag(e)) return; // that click was the end of a drag
    if (open) setOpen(false);
    else openChat();
  };

  const onKeyDown = (e) => {
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
  const state = carried ? 'carried' : pressed ? 'pressed' : landed ? 'dropped' : 'rest';

  return createPortal(
    <>
      <span ref={ruler} className="noora-ruler" aria-hidden="true" />
      {chatWanted ? (
        // If the chat ever fails, she stays; opening it again gives it another go.
        <ErrorBoundary name="MiniNoora chat" fallback={null} resetKey={open}>
          <Suspense fallback={null}>
            <ChatPanel id={chatId} open={open} place={place} year={year} calm={calm} onClose={closeChat} onPose={setChatPose} />
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
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerEnter={(e) => setHovered(e.pointerType !== 'touch')}
        onPointerLeave={() => setHovered(false)}
        onFocus={(e) => setFocused(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        {...drag.handlers}
      />
    </>,
    document.body,
  );
}
