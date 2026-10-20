// Data Mine: eight of the week's words hidden in a 10 by 10 grid, in any of eight directions. Drag from a word's
// first letter to its last (the line keeps to the nearest direction), or tap the first letter and then the last;
// the arrow keys and Enter do the same. Found words stay marked with a line of their own colour.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, cx, glyph, Icon } from '../../../../ui';
import { cellAt, cellTones, findTone, lineCells, pointIn, posKey, samePos, snapEnd, type Pos } from '../../lib/search';
import type { SearchFound } from '../../types';
import type { GameProps } from '../registry';
import './SearchGame.css';

interface Drag {
  pointer: number;
  start: Pos;
  end: Pos;
  moved: boolean;
}

export function SearchGame({ out, busy, play, flash, paused }: GameProps) {
  const { play: state } = out;
  const view = state.view.kind === 'search' ? state.view : null;
  const grid = view?.grid ?? [];
  const size = grid.length || 10;
  const over = state.status === 'won' || state.status === 'lost';
  const found = view?.found ?? [];
  const foundWords = new Set(found.map((f) => f.word));
  const hints = new Set((view?.hints ?? []).map(posKey));
  const tones = cellTones(found);

  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [anchor, setAnchor] = useState<Pos | null>(null); // the first letter, picked by a tap
  const [focus, setFocus] = useState<Pos>({ row: 0, col: 0 });
  const [fresh, setFresh] = useState<string | null>(null); // the word just found, drawn in
  const [missed, setMissed] = useState<{ start: Pos; end: Pos } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const find = async (start: Pos, end: Pos) => {
    setAnchor(null);
    if (samePos(start, end) || !lineCells(start, end)) return;
    const r = await play({ kind: 'find', start, end });
    if (!r.ok) {
      flash(r.code === 'already_tried' ? 'You’ve found that one already' : r.message, 'alert');
      return;
    }
    const after = r.out.play;
    if (after.result === 'found' && after.view.kind === 'search') {
      const word = after.view.found[after.view.found.length - 1]?.word ?? '';
      setFresh(word);
      later(() => setFresh(null), 700);
      if (after.status === 'won') flash('Every word found', 'good');
    } else {
      setMissed({ start, end });
      later(() => setMissed(null), 450);
      flash('Not one of the words', 'info');
    }
  };

  // ── Pointer: a drag is a line; a tap picks a first or a last letter ─────────────────────────────
  const at = (e: PointerEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    return rect ? pointIn(e.clientX, e.clientY, rect, size) : null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (over || busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const point = at(e);
    const cell = point ? cellAt(point, size) : null;
    if (!cell) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setFocus(cell);
    setDrag({ pointer: e.pointerId, start: cell, end: cell, moved: false });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const point = at(e);
    if (!point) return;
    const end = snapEnd(drag.start, point, size);
    if (!samePos(end, drag.end)) setDrag({ ...drag, end, moved: true });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const { start, end, moved } = drag;
    setDrag(null);
    if (moved && !samePos(start, end)) void find(start, end);
    else tap(start);
  };

  const tap = (cell: Pos) => {
    if (over || busy) return;
    if (!anchor) setAnchor(cell);
    else if (samePos(anchor, cell)) setAnchor(null);
    else if (lineCells(anchor, cell)) void find(anchor, cell);
    else setAnchor(cell);
  };

  // ── Keyboard: arrows move, Enter and Space pick, Escape lets go ────────────────────────────────
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (paused) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const step = moves[e.key];
    if (step) {
      e.preventDefault();
      const next = {
        row: Math.min(size - 1, Math.max(0, focus.row + step[0])),
        col: Math.min(size - 1, Math.max(0, focus.col + step[1])),
      };
      setFocus(next);
      cellRefs.current[next.row * size + next.col]?.focus();
    } else if (e.key === 'Escape' && anchor) {
      e.preventDefault();
      setAnchor(null);
    }
  };

  // What's drawn as the line in hand: a drag, or from the tapped first letter to the focused cell.
  const live = drag?.moved ? { start: drag.start, end: drag.end } : null;
  const liveCells = new Set((live ? (lineCells(live.start, live.end) ?? []) : []).map(posKey));

  return (
    <div className="ds">
      <ul
        className="ds-words"
        aria-label={`Words to find: ${found.filter((f) => !f.revealed).length} of ${view?.words.length ?? 8} found`}
      >
        {(view?.words ?? []).map((w) => {
          const f = found.find((x) => x.word === w);
          return (
            <li
              key={w}
              className={cx(
                'ds-word',
                f && !f.revealed && `is-found is-tone-${findTone(found.indexOf(f))}`,
                f?.revealed && 'is-revealed',
                fresh === w && 'is-fresh',
              )}
              style={f ? ({ '--tone': `var(--dy-find-${findTone(found.indexOf(f))})` } as CSSProperties) : undefined}
            >
              {w}
              {f ? <span className="visually-hidden">{f.revealed ? ' (not found)' : ' (found)'}</span> : null}
            </li>
          );
        })}
      </ul>

      <div className="ds-grid-wrap">
        <div className="ds-frame">
          <div
            ref={gridRef}
            className={cx('ds-grid', drag && 'is-dragging')}
            style={{ '--size': size } as CSSProperties}
            role="group"
            aria-label={
              anchor
                ? `Letters. First letter picked: row ${anchor.row + 1}, column ${anchor.col + 1}. Pick the last letter.`
                : 'Letters. Pick a word’s first letter, then its last.'
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={onKeyDown}
          >
            <svg className="ds-lines" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
              {found.map((f, i) => (
                <Line key={f.word} item={f} tone={findTone(i)} fresh={fresh === f.word} />
              ))}
              {live ? <Line item={{ ...live, revealed: false }} tone={-1} fresh={false} /> : null}
              {missed ? <Line item={{ ...missed, revealed: false }} tone={-2} fresh={false} /> : null}
            </svg>
            {grid.map((row, r) =>
              [...row].map((letter, c) => {
                const pos = { row: r, col: c };
                const key = posKey(pos);
                return (
                  <button
                    key={key}
                    ref={(el) => {
                      cellRefs.current[r * size + c] = el;
                    }}
                    type="button"
                    tabIndex={samePos(focus, pos) ? 0 : -1}
                    className={cx(
                      'ds-cell',
                      tones.has(key) && `is-tone-${tones.get(key)}`,
                      samePos(anchor, pos) && 'is-anchor',
                      liveCells.has(key) && 'is-live',
                      hints.has(key) && !over && 'is-hint',
                    )}
                    aria-label={`${letter}, row ${r + 1}, column ${c + 1}`}
                    aria-pressed={samePos(anchor, pos)}
                    disabled={over}
                    onFocus={() => setFocus(pos)}
                    onClick={(e) => {
                      // Pointer taps arrive through the grid's pointer handlers; this is Enter and Space.
                      if (e.detail === 0) tap(pos);
                    }}
                  >
                    {letter}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>

      <div className="ds-foot">
        <span className="ds-foot__count dy-num">
          {found.filter((f) => !f.revealed).length} of {view?.words.length ?? 8} found
        </span>
        {!over ? (
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Icon glyph={glyph.sparkle} />}
            disabled={busy || foundWords.size >= (view?.words.length ?? 8)}
            onClick={async () => {
              const r = await play({ kind: 'hint' });
              if (r.ok) flash('A word starts on the ringed letter', 'info');
              else flash(r.message, 'alert');
            }}
          >
            Hint
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Line({
  item,
  tone,
  fresh,
}: {
  item: Pick<SearchFound, 'start' | 'end' | 'revealed'>;
  tone: number;
  fresh: boolean;
}) {
  const x1 = item.start.col + 0.5;
  const y1 = item.start.row + 0.5;
  const x2 = item.end.col + 0.5;
  const y2 = item.end.row + 0.5;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const cls = tone === -1 ? 'is-live' : tone === -2 ? 'is-miss' : item.revealed ? 'is-revealed' : `is-tone-${tone}`;
  return (
    <line
      className={cx('ds-line', cls, fresh && 'is-fresh')}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      style={{ '--len': length } as CSSProperties}
    />
  );
}

/** The rules' example: a word found on a diagonal. */
export function SearchExample() {
  const rows = ['DXQP', 'LAMR', 'KOTE', 'BWSA'];
  return (
    <div className="dg-eg">
      <div className="ds-eg" aria-hidden="true">
        <svg className="ds-lines" viewBox="0 0 4 4">
          <line className="ds-line is-tone-0" x1={0.5} y1={0.5} x2={3.5} y2={3.5} />
        </svg>
        {rows.map((row, r) =>
          [...row].map((l, c) => (
            <span key={`${r}${c}`} className={cx('ds-cell', r === c && 'is-tone-0')}>
              {l}
            </span>
          )),
        )}
      </div>
      <p className="dg-eg__caption">
        <strong>DATA</strong> runs diagonally. Drag from its first letter to its last, or tap D and then A.
      </p>
    </div>
  );
}
