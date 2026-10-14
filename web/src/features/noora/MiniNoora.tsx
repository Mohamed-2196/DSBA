// Mini Noora, the Hub's floating study helper: a mascot you can pick up and put at either edge of the screen, and a
// chat card that opens beside her when she is pressed (on a phone, a sheet above the tab bar that she stands on).
// This file holds her state and puts the parts together:
//   Mascot     the draggable sprite (Mascot.tsx)
//   ChatPanel  the chat and its scripted "brain" (ChatPanel.tsx), fetched on demand so that the shell, which is on
//              every page, only carries the mascot
// She remembers two things in localStorage: hub.noora.pos (the edge and height she was put at) and hub.noora.seen
// (the first-visit hint has done its job). Hiding her is visibility.ts.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { BREAKPOINTS, useLocalStorage, useMediaQuery, useToast } from '../../state';
import { ModulesGate } from '../../state/ModulesProvider';
import { Button, ErrorBoundary, QueryError, cx } from '../../ui';
import { Face } from './Face';
import { avoid, clampPoint, fromAnchor, homePoint, perchOnSheet, placeChat, toAnchor, type Anchor, type Point, type Rect, type Side } from './layout';
import { Mascot, type MascotState } from './Mascot';
import { askNoora, CHAT_ID, closeNoora, isNooraShortcut, openNoora, toggleNoora, useNooraOpen } from './open';
import { choosePose, heading, lean, motionFor, type ChatMood, type Heading } from './poses';
import { HEIGHT, figure, preloadSprites } from './sprites';
import { useDrag } from './useDrag';
import { useViewport } from './useViewport';
import { hideMiniNoora, isMiniNooraHidden, showMiniNoora, useMiniNooraHidden } from './visibility';
import './ChatCard.css';

const loadChat = () => import('./ChatPanel');
const ChatPanel = lazy(loadChat);

const POS_KEY = 'hub.noora.pos';
const SEEN_KEY = 'hub.noora.seen';

const WALK_FRAME = 125; // ms per frame: carried sideways, she walks at 8 frames a second
const LANDING = 900; // ms she looks pleased after being put down
const HINT_DELAY = 1400; // ms before the first-visit hint speaks up
const HINT_STAYS = 12_000; // ms it stays before it has done its job (it never covers a form for long)
const LOOK_AGAIN = [350, 1500]; // ms after a new page before she checks what she might cover (it may still be loading)
const SETTLED = 220; // ms after the page stops scrolling before she checks again
const NUDGE: Partial<Record<string, [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** The controls she steps aside for: primary buttons, form submits, and anything marked data-noora-avoid. */
const KEY_CONTROLS = '.ui-button--primary, button[type="submit"], [data-noora-avoid]';

function keyControls(): Rect[] {
  const out: Rect[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(KEY_CONTROLS)) {
    if (el.closest('.noora, .ncard')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight) continue;
    out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return out;
}

const sameRects = (a: readonly Rect[], b: readonly Rect[]): boolean =>
  a.length === b.length && a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.w === b[i].w && r.h === b[i].h);

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

/**
 * Mounted once by the shell while the `noora` feature is on. Nothing at all while she is hidden, or on a phone while
 * the year prompt takes the bottom of the screen. Her keyboard shortcut works either way: it brings her back.
 */
export function MiniNoora() {
  const hidden = useMiniNooraHidden();
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const onboarding = useOnboardingOpen();

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!isNooraShortcut(e) || e.isComposing) return;
      e.preventDefault();
      const from = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      if (isMiniNooraHidden()) askNoora(from);
      else toggleNoora(from);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return hidden || (phone && onboarding) ? null : <Noora />;
}

function Noora() {
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const onboarding = useOnboardingOpen();
  const { pathname } = useLocation();
  const top = useRef<HTMLSpanElement>(null);
  const bottom = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLElement>(null);
  const view = useViewport(top, bottom);
  const size = useMemo(() => figure(phone ? HEIGHT.phone : HEIGHT.desktop), [phone]);
  const open = useNooraOpen();

  // Stored JSON is not trusted: fromAnchor() checks the anchor, and `seen` counts only when it is true.
  const [anchor, setAnchor] = useLocalStorage<Anchor | null>(POS_KEY, null);
  const [seenStored, setSeen] = useLocalStorage<unknown>(SEEN_KEY, false);
  const seen = seenStored === true;
  const [chatWanted, setChatWanted] = useState(open); // opened at least once: keep it, and the conversation, around
  const [mood, setMood] = useState<ChatMood | null>(null); // what the chat asks of her
  const [carry, setCarry] = useState<Carried | null>(null); // while she is dragged
  const [step, setStep] = useState<0 | 1>(0); // walk-cycle frame
  const [pressed, setPressed] = useState(false);
  const [landed, setLanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hintDue, setHintDue] = useState(false);
  const [controls, setControls] = useState<Rect[]>([]);

  useEffect(() => {
    if (open) setChatWanted(true);
  }, [open]);

  // ── Where she is ────────────────────────────────────────────────────────────────────────────────
  // Where she was last put (or her corner), stepped aside from any key control, unless a hand is carrying her.
  const home = useMemo(() => fromAnchor(anchor, view, size) ?? homePoint(view, size, phone), [anchor, view, size, phone]);
  const rest = useMemo(() => avoid(home, view, size, controls), [home, view, size, controls]);
  const free = carry ? carry.point : rest;
  // The chat goes beside her and follows her. While it is open it stays on the side it is on for as long as it fits.
  const chatSide = useRef<Side | null>(null);
  const place = useMemo(() => placeChat(free, view, size, { phone, prefer: chatSide.current }), [free, view, size, phone]);
  useEffect(() => {
    chatSide.current = open ? place.side : null;
  }, [open, place]);
  // On a phone the chat is a sheet over the bottom of the screen, so she hops onto its top edge.
  const perched = open && place.sheet;
  const point = perched ? perchOnSheet(place, view, size) : free;

  // What she might cover: checked on a new page, when the window changes, once scrolling stops and when she is put
  // down. Not while her chat is open: the card is placed beside her and should not move.
  const lookAround = useCallback(() => {
    const next = keyControls();
    setControls((prev) => (sameRects(prev, next) ? prev : next));
  }, []);
  useEffect(() => {
    if (open) return undefined;
    const timers = LOOK_AGAIN.map((ms) => window.setTimeout(lookAround, ms));
    let settle = 0;
    const onScroll = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(lookAround, SETTLED);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(settle);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, pathname, lookAround]);

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
      // She snaps to the nearer edge and keeps the height she was let go at.
      setAnchor(toAnchor(at.current, view, size));
      setCarry(null);
      setLanded(true);
      lookAround();
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
  const { push } = useToast();
  const hide = useCallback(() => {
    closeNoora({ restoreFocus: false });
    hideMiniNoora();
    document.getElementById('main')?.focus({ preventScroll: true });
    push({ title: 'Mini Noora is hidden', body: 'Bring her back from search: type “Noora”.', action: { label: 'Undo', onClick: showMiniNoora }, duration: 8000 });
  }, [push]);
  const close = useCallback(() => closeNoora(), []);
  // On a phone the sheet would hide the page a link leads to, so it closes. Elsewhere the card stays beside her.
  const follow = useCallback(() => {
    if (phone) closeNoora({ restoreFocus: false });
  }, [phone]);
  useEffect(() => {
    if (!open) setMood(null);
  }, [open]);

  useEffect(() => {
    preloadSprites();
    // Fetch the chat's code once the page has settled, so that her first press opens it at once.
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
  // Only on Home, where nothing it could cover is being filled in, and only for a while.
  const onHome = pathname === '/';
  useEffect(() => {
    if (seen || onboarding || !onHome) return undefined;
    const due = setTimeout(() => setHintDue(true), HINT_DELAY);
    return () => clearTimeout(due);
  }, [seen, onboarding, onHome]);
  const hintSide: Side = point.x + size.w / 2 > view.w / 2 ? 'left' : 'right';
  const hint = hintDue && onHome && !seen && !onboarding && !open && !carried ? hintSide : null;
  const hinting = hint !== null;
  useEffect(() => {
    if (!hinting) return undefined;
    const done = setTimeout(() => setSeen(true), HINT_STAYS);
    return () => clearTimeout(done);
  }, [hinting, setSeen]);

  const openFromHint = () => {
    markSeen();
    openNoora(button.current);
  };
  // Closed from its button: done for good. Focus goes to her, not to the top of the page, when it was on the bubble.
  const closeHint = () => {
    const hadFocus = document.activeElement instanceof Element && document.activeElement.closest('.noora__hint') !== null;
    setSeen(true);
    if (hadFocus) button.current?.focus();
  };

  // ── Events on her ───────────────────────────────────────────────────────────────────────────────
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (drag.followsDrag(e)) return; // that click was the end of a drag
    markSeen();
    toggleNoora(e.currentTarget);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closeNoora();
      return;
    }
    // Arrow keys move her: left and right to the other edge, up and down along it (Shift: further).
    const dir = NUDGE[e.key];
    if (!dir || perched || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    markSeen();
    if (dir[0]) {
      setAnchor({ side: dir[0] < 0 ? 'left' : 'right', lift: Math.round(view.floor - (home.y + size.h)) });
      return;
    }
    const by = e.shiftKey ? 64 : 16;
    setAnchor(toAnchor(clampPoint({ x: home.x, y: home.y + dir[1] * by }, view, size), view, size));
  };

  const lively = hovered || focused;
  const chatMood = open ? mood : null;
  const pose = choosePose({ carry, step: calm ? 0 : step, pressed, dropped: landed, chat: chatMood, lively });
  const state: MascotState = carried ? 'carried' : pressed ? 'pressed' : landed ? 'dropped' : 'rest';
  // 'talking' gestures to her left (our right): turn her round to face the chat, or the middle of the screen.
  const faceLeft = open ? place.side === 'left' && !place.sheet : point.x + size.w / 2 > view.w / 2;

  const cardStyle = { left: place.left, top: place.top, width: place.width, height: place.height } as CSSProperties;

  return createPortal(
    <>
      <span ref={top} className="noora-ruler noora-ruler--top" aria-hidden="true" />
      <span ref={bottom} className="noora-ruler noora-ruler--bottom" aria-hidden="true" />
      {chatWanted ? (
        <section
          ref={card}
          id={CHAT_ID}
          className={cx('ncard', place.sheet ? 'ncard--sheet' : 'ncard--float')}
          data-side={place.side}
          style={cardStyle}
          role="dialog"
          aria-modal={false}
          aria-label="Mini Noora"
          tabIndex={-1}
          hidden={!open}
          data-hub="noora-chat"
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
            // Not from a dialog or menu of its own, which closes itself.
            if (!(e.target instanceof Node && e.currentTarget.contains(e.target))) return;
            e.preventDefault();
            closeNoora();
          }}
        >
          {/* If the chat ever fails, she stays and the page carries on; opening it again gives it another go. */}
          <ErrorBoundary name="MiniNoora chat" fallback={<Broken />} resetKey={open}>
            <ModulesGate
              fallback={<Loading />}
              error={(retry, error, retrying) => (
                <div className="ncard-note">
                  <QueryError error={error} title="Mini Noora didn’t load" onRetry={retry} retrying={retrying} size="sm" panel={false} />
                </div>
              )}
            >
              <Suspense fallback={<Loading />}>
                <ChatPanel open={open} sheet={place.sheet} calm={calm} panelRef={card} onClose={close} onFollow={follow} onHide={hide} onMood={setMood} />
              </Suspense>
            </ModulesGate>
          </ErrorBoundary>
        </section>
      ) : null}
      <Mascot
        ref={button}
        point={point}
        size={size}
        pose={pose}
        mirrored={pose === 'talking' && faceLeft}
        state={state}
        motion={calm ? 'breathe' : motionFor({ chat: chatMood, lively })}
        tilt={carry ? carry.tilt : 0}
        open={open}
        chatId={CHAT_ID}
        hint={hint}
        onHintClick={openFromHint}
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

function Broken() {
  return (
    <div className="ncard-note" role="alert">
      <Face bust="thinking" size={48} />
      <p>Mini Noora stopped working. Close the chat and open it again.</p>
      <Button size="sm" onClick={() => closeNoora()}>
        Close chat
      </Button>
    </div>
  );
}

function Loading() {
  return (
    <div className="ncard-note" role="status">
      <Face bust="thinking" size={48} />
      <p>Opening the chat…</p>
    </div>
  );
}
