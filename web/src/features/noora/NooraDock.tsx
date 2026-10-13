// Where Mini Noora lives. She never covers the page:
//   laptops (≥ 1100 px)   a panel docked beside the page, which narrows to make room (two widths, remembered per
//                         viewer); closed, a slim tab at the edge where the panel opens
//   phones and tablets    a sheet from the bottom with a drag handle (half or full height), opened from the top bar
//                         (tablets) or the tab bar (phones); closed by swiping it down, Esc or its close button
// The chat inside (ChatPanel.tsx) is fetched on demand and stays mounted once opened, so the conversation lasts while
// the student moves around the Hub.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { BREAKPOINTS, useLocalStorage, useMediaQuery, useToast } from '../../state';
import { ModulesGate } from '../../state/ModulesProvider';
import { Button, ErrorBoundary, QueryError, cx } from '../../ui';
import { closeNoora, isDockWidth, openNoora, PANEL_ID, useNooraOpen, WIDTH_KEY, type DockWidth } from './dock';
import { Face } from './Face';
import { settle, type Snap } from './sheet';
import { preloadSprites } from './sprites';
import { hideMiniNoora, showMiniNoora, useMiniNooraHidden } from './visibility';
import './NooraDock.css';

const loadChat = () => import('./ChatPanel');
const ChatPanel = lazy(loadChat);

const CLOSING = 200; // ms the sheet takes to slide away (the CSS animation's length)
const TAP = 6; // px: a handle that moved less than this was tapped, not dragged

/** Keep the sheet on screen for a moment after it closes, so it can slide away. */
function usePresence(open: boolean, ms: number): boolean {
  const [lingering, setLingering] = useState(open);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return undefined;
    }
    const gone = setTimeout(() => setLingering(false), ms);
    return () => clearTimeout(gone);
  }, [open, ms]);
  return open || lingering;
}

interface Dragging {
  y0: number;
  from: Snap;
  height: number;
  lastY: number;
  lastT: number;
  vy: number;
  moved: boolean;
}

/** Mounted once by the shell, while the `noora` feature is on. Nothing at all while she is hidden. */
export function NooraDock() {
  const hidden = useMiniNooraHidden();
  return hidden ? null : <Dock />;
}

function Dock() {
  const open = useNooraOpen();
  const docked = useMediaQuery(BREAKPOINTS.desktop);
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canHalf = useMediaQuery('(min-height: 600px)');
  const [storedWidth, setWidth] = useLocalStorage<unknown>(WIDTH_KEY, 'narrow');
  const width: DockWidth = isDockWidth(storedWidth) ? storedWidth : 'narrow';
  const [wanted, setWanted] = useState(open); // opened at least once: keep the chat, and the conversation, around
  const [snap, setSnap] = useState<Snap>('half');
  const [dragDy, setDragDy] = useState<number | null>(null);
  const drag = useRef<Dragging | null>(null);
  const panel = useRef<HTMLElement>(null);
  const sheet = !docked;
  const present = usePresence(open, sheet && !calm ? CLOSING : 0);
  const height: Snap = canHalf ? snap : 'full';

  useEffect(() => {
    if (open) setWanted(true);
    else setSnap('half'); // a sheet opens at half height again
  }, [open]);

  // Fetch the chat's code and her portraits once the page has settled, so the first open is instant.
  useEffect(() => {
    const warm = () => {
      preloadSprites();
      loadChat().catch(() => {});
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 800);
    return () => window.clearTimeout(id);
  }, []);

  const { push } = useToast();
  const hide = useCallback(() => {
    closeNoora({ restoreFocus: false });
    hideMiniNoora();
    document.getElementById('main')?.focus({ preventScroll: true });
    push({ title: 'Mini Noora is hidden', body: 'Bring her back from search: type “Noora”.', action: { label: 'Undo', onClick: showMiniNoora }, duration: 8000 });
  }, [push]);
  const close = useCallback(() => closeNoora(), []);
  // On a laptop the panel stays open beside the page a link leads to. A sheet would hide that page.
  const follow = useCallback(() => {
    if (sheet) closeNoora({ restoreFocus: false });
  }, [sheet]);
  const toFull = useCallback(() => {
    if (sheet) setSnap('full');
  }, [sheet]);

  // ── The sheet's handle: drag it, or tap it to switch heights ───────────────────────────────────
  const onHandleDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !panel.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, from: height, height: panel.current.offsetHeight, lastY: e.clientY, lastT: e.timeStamp, vy: 0, moved: false };
    setDragDy(0);
  };
  const onHandleMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vy = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) >= TAP) d.moved = true;
    setDragDy(dy);
  };
  const onHandleUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    setDragDy(null);
    if (!d.moved) {
      drag.current = null;
      return; // a tap: the click that follows switches heights
    }
    const next = settle({ from: d.from, dy: e.clientY - d.y0, vy: d.vy, height: d.height, canHalf });
    if (next === 'closed') closeNoora();
    else setSnap(next);
  };
  const onHandleClick = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) return; // the end of a drag
    setSnap((s) => (s === 'half' ? 'full' : 'half'));
  };

  const style = {
    '--nd-w': width === 'wide' ? 'var(--nd-w-wide)' : 'var(--nd-w-narrow)',
    ...(dragDy != null ? { '--nd-dy': `${Math.max(0, dragDy)}px`, '--nd-grow': `${Math.max(0, -dragDy)}px` } : null),
  } as CSSProperties;

  return (
    <div className={cx('nd', docked ? 'nd--docked' : 'nd--sheet', open && 'is-open')} style={style} data-hub="noora-dock">
      {docked && !open ? (
        <button
          type="button"
          className="nd-tab"
          aria-label="Ask Mini Noora"
          aria-expanded={false}
          aria-controls={PANEL_ID}
          onClick={(e) => openNoora(e.currentTarget)}
          data-hub="noora-launcher"
        >
          <Face size={30} className="nd-tab__face" />
          <span className="nd-tab__label" aria-hidden="true">
            Ask Noora
          </span>
        </button>
      ) : null}
      {wanted ? (
        <section
          ref={panel}
          id={PANEL_ID}
          className={cx('nd-panel', dragDy != null && 'is-dragging')}
          role={sheet ? 'dialog' : 'complementary'}
          aria-modal={sheet ? false : undefined}
          aria-label="Mini Noora"
          tabIndex={-1}
          hidden={!present}
          data-state={open ? 'open' : 'closing'}
          data-height={sheet ? height : undefined}
          data-hub="noora-chat"
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
            // Not from a dialog of its own (the clear-chat question), which closes itself.
            if (!(e.target instanceof Node && e.currentTarget.contains(e.target))) return;
            e.preventDefault();
            closeNoora();
          }}
        >
          {sheet ? (
            canHalf ? (
              <button
                type="button"
                className="nd-handle"
                aria-label={height === 'half' ? 'Make the chat full height' : 'Make the chat half height'}
                onPointerDown={onHandleDown}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                onClick={onHandleClick}
                data-hub="noora-handle"
              >
                <span className="nd-handle__bar" aria-hidden="true" />
              </button>
            ) : (
              <div className="nd-handle" aria-hidden="true" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
                <span className="nd-handle__bar" />
              </div>
            )
          ) : null}
          {/* If the chat ever fails, the page carries on; opening it again gives it another go. */}
          <ErrorBoundary name="MiniNoora chat" fallback={<Broken />} resetKey={open}>
            <ModulesGate
              fallback={<Loading />}
              error={(retry, error, retrying) => (
                <div className="nd-note">
                  <QueryError error={error} title="Mini Noora didn’t load" onRetry={retry} retrying={retrying} size="sm" panel={false} />
                </div>
              )}
            >
              <Suspense fallback={<Loading />}>
                <ChatPanel
                  open={open}
                  sheet={sheet}
                  calm={calm}
                  panelRef={panel}
                  width={docked ? width : null}
                  onWidth={setWidth}
                  onComposerFocus={toFull}
                  onClose={close}
                  onFollow={follow}
                  onHide={hide}
                />
              </Suspense>
            </ModulesGate>
          </ErrorBoundary>
        </section>
      ) : null}
    </div>
  );
}

function Broken() {
  return (
    <div className="nd-note" role="alert">
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
    <div className="nd-note" role="status">
      <Face bust="thinking" size={48} />
      <p>Opening the chat…</p>
    </div>
  );
}
