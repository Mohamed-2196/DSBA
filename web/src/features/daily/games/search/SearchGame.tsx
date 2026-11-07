// Data Mine, as DSBA Daily plays it: the clue on a banner, a pill with the letters being traced (or what the last
// word did), the 6 by 8 grid of round letters, and at the foot how many theme words are found and the hint, which
// three other words earn. Drag through letters that touch, or tap them one by one and tap the last again; the arrow
// keys move and Enter taps. Found words stay joined by a line: blue, the spangram gold.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, cx, glyph, Icon } from '../../../../ui';
import { cellAt, dragTo, linePath, posKey, samePos, tapAt, type Pos } from '../../lib/search';
import type { GameProps } from '../registry';
import './SearchGame.css';

const U = 100; // SVG units a letter
const PER_HINT = 3;
const MIN_LETTERS = 4;

type Pill = { text: string; tone: 'found' | 'span' | 'word' | 'bad' | 'info' };

interface Press {
  down: Pos;
  moved: boolean;
  continued: boolean; // pressed on the last letter of a tapped path: a drag goes on from it
}

export function SearchGame({ out, play, flash, paused }: GameProps) {
  const { play: state } = out;
  const view = state.view.kind === 'search' ? state.view : null;
  const rows = view?.rows ?? 8;
  const cols = view?.cols ?? 6;
  const grid = view?.grid ?? [];
  const over = state.status === 'won' || state.status === 'lost';

  const owner = useMemo(() => {
    const m = new Map<string, { word: string; i: number; spangram: boolean; revealed: boolean }>();
    for (const f of view?.found ?? []) {
      f.cells.forEach((c, i) => m.set(posKey(c), { word: f.word, i, spangram: f.spangram, revealed: f.revealed }));
    }
    return m;
  }, [view?.found]);
  const hinted = useMemo(() => new Set((view?.hintCells ?? []).map(posKey)), [view?.hintCells]);
  const usable = (p: Pos) => !owner.has(posKey(p));

  const [path, setPathState] = useState<Pos[]>([]);
  const pathRef = useRef<Pos[]>([]);
  const setPath = (p: Pos[]) => {
    pathRef.current = p;
    setPathState(p);
  };
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [pill, setPill] = useState<Pill | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [focus, setFocus] = useState<Pos>({ row: 0, col: 0 });
  const board = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve()); // words traced quickly are checked in turn
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const show = (p: Pill) => {
    setPill(p);
    timers.current.push(window.setTimeout(() => setPill((now) => (now === p ? null : now)), 1400));
  };

  const check = async (cells: Pos[]) => {
    const word = cells.map((c) => grid[c.row]?.[c.col] ?? '').join('');
    const r = await play({ kind: 'trace', cells });
    if (!r.ok) {
      show(r.code === 'already_tried' ? { text: 'Already found', tone: 'info' } : { text: r.message, tone: 'bad' });
      return;
    }
    const result = r.out.play.result;
    if (result === 'found' || result === 'spangram') {
      setFresh(word);
      timers.current.push(window.setTimeout(() => setFresh(null), 900));
      show(result === 'spangram' ? { text: 'SPANGRAM!', tone: 'span' } : { text: 'Theme word!', tone: 'found' });
    } else if (result === 'word') {
      show({ text: `${word} · +1 towards a hint`, tone: 'word' });
    }
  };

  const send = (cells: Pos[]) => {
    setPath([]);
    setPointer(null);
    if (cells.length < 2) return;
    if (cells.length < MIN_LETTERS) {
      show({ text: 'Too short', tone: 'bad' });
      return;
    }
    queue.current = queue.current.then(() => check(cells));
  };

  const hint = async () => {
    const r = await play({ kind: 'hint' });
    if (!r.ok) flash(r.message, 'alert');
    else show({ text: 'The outlined letters spell a theme word', tone: 'info' });
  };

  // ── Pointer: pressing alone changes nothing; moving starts a drag, letting go in place is a tap ─────────────────
  const at = (e: PointerEvent): Pos | null => {
    const rect = board.current?.getBoundingClientRect();
    if (!rect) return null;
    return cellAt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, rows, cols);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (over || paused) return;
    const cell = at(e);
    if (!cell || !usable(cell)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const last = pathRef.current[pathRef.current.length - 1];
    press.current = { down: cell, moved: false, continued: samePos(last, cell) };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pr = press.current;
    const rect = board.current?.getBoundingClientRect();
    if (!pr || !rect) return;
    const cell = at(e);
    if (!pr.moved) {
      if (!cell || samePos(cell, pr.down)) return;
      pr.moved = true;
      if (!pr.continued) setPath([pr.down]);
    }
    setPointer({
      x: ((e.clientX - rect.left) / rect.width) * cols * U,
      y: ((e.clientY - rect.top) / rect.height) * rows * U,
    });
    if (cell) setPath(dragTo(pathRef.current, cell, usable));
  };
  const onPointerUp = () => {
    const pr = press.current;
    press.current = null;
    setPointer(null);
    if (!pr) return;
    if (pr.moved) send(pathRef.current);
    else tap(pr.down);
  };
  const tap = (cell: Pos) => {
    const next = tapAt(pathRef.current, cell, usable);
    if (next.send) send(next.path);
    else setPath(next.path);
  };

  // ── Keyboard: arrows move between letters, Enter or Space taps, Escape clears ──────────────────────────────────
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, Pos> = {
      ArrowUp: { row: focus.row - 1, col: focus.col },
      ArrowDown: { row: focus.row + 1, col: focus.col },
      ArrowLeft: { row: focus.row, col: focus.col - 1 },
      ArrowRight: { row: focus.row, col: focus.col + 1 },
    };
    const to = moves[e.key];
    if (to) {
      e.preventDefault();
      if (to.row >= 0 && to.row < rows && to.col >= 0 && to.col < cols) {
        setFocus(to);
        board.current?.querySelector<HTMLElement>(`[data-cell="${posKey(to)}"]`)?.focus();
      }
    } else if (e.key === 'Escape') setPath([]);
  };

  const letters = path.map((c) => grid[c.row]?.[c.col] ?? '').join('');
  const picked = new Set(path.map(posKey));
  const found = (view?.found ?? []).filter((f) => !f.revealed).length;
  const tail = pointer ? ` L${pointer.x} ${pointer.y}` : '';
  const hintsLeft = view?.hintsLeft ?? 0;
  const hintProgress = view?.hintProgress ?? 0;

  return (
    <div className="dm">
      <div className="dm-banner">
        <p className="dm-banner__label">{over && view?.title ? 'Today’s theme' : 'Today’s clue'}</p>
        <p className="dm-banner__clue">{over && view?.title ? view.title : view?.clue}</p>
      </div>

      <div className="dm-pill-row" aria-live="polite">
        {letters ? (
          <span className="dm-pill is-trace" key="trace">
            {letters}
          </span>
        ) : pill ? (
          <span className={cx('dm-pill', `is-${pill.tone}`)} key={pill.text}>
            {pill.text}
          </span>
        ) : null}
      </div>

      <div
        ref={board}
        className="dm-board"
        style={{ '--rows': rows, '--cols': cols } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          setPointer(null);
        }}
        onKeyDown={onKeyDown}
        role="group"
        aria-label={`Letter grid, ${(view?.total ?? 0) - found} theme words left. Arrow keys move, Enter picks a letter.`}
      >
        <svg className="dm-lines" viewBox={`0 0 ${cols * U} ${rows * U}`} aria-hidden="true">
          <defs>
            <filter id="dm-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
          </defs>
          {(view?.found ?? []).map((f) => (
            <path
              key={f.word}
              className={cx(
                'dm-line',
                f.spangram && 'is-span',
                f.revealed && 'is-revealed',
                fresh === f.word && 'is-fresh',
              )}
              d={linePath(f.cells, U)}
              pathLength={1}
            />
          ))}
          {path.length ? (
            <>
              <path className="dm-trace-glow" d={linePath(path, U) + tail} filter="url(#dm-glow)" />
              <path className="dm-trace" d={linePath(path, U) + tail} />
            </>
          ) : null}
        </svg>
        <div className="dm-grid">
          {grid.flatMap((row, r) =>
            [...row].map((letter, c) => {
              const pos = { row: r, col: c };
              const key = posKey(pos);
              const own = owner.get(key);
              const on = picked.has(key);
              const hint = hinted.has(key) && !own;
              const where = `${letter}, row ${r + 1}, column ${c + 1}`;
              return (
                <div key={key} className="dm-cell">
                  <button
                    type="button"
                    data-cell={key}
                    tabIndex={samePos(focus, pos) ? 0 : -1}
                    onFocus={() => setFocus(pos)}
                    // Keyboard and screen readers arrive as clicks with detail 0; a mouse or a finger goes through
                    // the board's pointer handlers.
                    onClick={(e) => {
                      if (e.detail === 0 && !over && usable(pos)) tap(pos);
                    }}
                    aria-label={`${where}${own ? `, part of ${own.word}` : ''}${on ? ', picked' : ''}${hint ? ', hinted' : ''}`}
                    aria-pressed={on}
                    className={cx(
                      'dm-letter',
                      on && 'is-picked',
                      own && (own.spangram ? 'is-span' : 'is-found'),
                      own?.revealed && 'is-revealed',
                      own && fresh === own.word && 'is-fresh',
                      hint && 'is-hinted',
                    )}
                    style={own ? ({ '--i': own.i } as CSSProperties) : undefined}
                  >
                    {letter}
                  </button>
                </div>
              );
            }),
          )}
        </div>
      </div>

      {!over ? (
        <div className="dm-foot">
          <p className="dm-foot__count" aria-live="polite">
            <b className="dy-num">{found}</b> of {view?.total ?? 0} theme words found
          </p>
          <Button
            variant={hintsLeft > 0 ? 'primary' : 'secondary'}
            leadingIcon={<Icon glyph={glyph.bulb} />}
            onClick={() => void hint()}
            disabled={hintsLeft <= 0 || (view?.hintCells.length ?? 0) > 0}
            aria-label={
              hintsLeft > 0
                ? `Use a hint (${hintsLeft} left)`
                : `Hint: find ${PER_HINT - hintProgress} more words that aren't the theme's to earn one`
            }
          >
            Hint
            <span className="dm-dots" aria-hidden="true">
              {Array.from({ length: PER_HINT }, (_, i) => (
                <span key={i} className={cx(hintsLeft > 0 || i < hintProgress ? 'is-on' : null)} />
              ))}
            </span>
          </Button>
        </div>
      ) : null}
      <p className="dm-help">Drag through letters, or tap them one by one and tap the last letter again.</p>
    </div>
  );
}

/** The rules' example, DSBA Daily's: MINE is traced and found, then DATA, the spangram, lights up gold. */
export function SearchExample() {
  const grid = ['DATA', 'XLEA', 'MINE', 'SQLZ'];
  return (
    <div className="dg-eg">
      <div className="dm-eg" aria-hidden="true">
        {grid.flatMap((row, r) =>
          [...row].map((letter, c) => (
            <span
              key={`${r}${c}`}
              className={cx('dm-eg__cell', r === 2 && 'is-word', r === 0 && 'is-span')}
              style={{ '--c': c } as CSSProperties}
            >
              {letter}
            </span>
          )),
        )}
      </div>
      <p className="dg-eg__caption">
        <strong>MINE</strong> is a theme word. <strong>DATA</strong>, gold, is the spangram: it names the theme and runs
        from one side to the other.
      </p>
    </div>
  );
}
